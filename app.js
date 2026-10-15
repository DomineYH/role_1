/**
 * 우리 반 역할분담 (Classroom Role Assigner)
 * - 순수 JavaScript (ES6)
 * - 가상 학생 20명 기반 1인 1역 공정 배정 및 중복·누락 자동 검증
 * - GitHub Pages 정적 호스팅 완벽 지원
 */

(() => {
  'use strict';

  // =========================================================================
  // 1. 초기 기본 상태 데이터
  // =========================================================================

  // 가상 학생 20명 초기 데이터 (S01~S20, 가상01~가상20)
  const createDefaultStudents = () => {
    const list = [];
    for (let i = 1; i <= 20; i++) {
      const numStr = String(i).padStart(2, '0');
      list.push({
        id: `S${numStr}`,
        name: `가상${numStr}`,
        active: true,
      });
    }
    return list;
  };

  // 기본 6개 역할 목록 (총 정원 20명)
  const createDefaultRoles = () => [
    { id: 'role_1', name: '칠판 도우미', quota: 2 },
    { id: 'role_2', name: '급식 도우미', quota: 4 },
    { id: 'role_3', name: '환경 도우미', quota: 4 },
    { id: 'role_4', name: '학습 도우미', quota: 4 },
    { id: 'role_5', name: '체육 도우미', quota: 3 },
    { id: 'role_6', name: '방송 도우미', quota: 3 },
  ];

  // 애플리케이션 상태 (State)
  const state = {
    students: createDefaultStudents(),
    roles: createDefaultRoles(),
    currentAssignments: {}, // roleId -> Array of student objects
    previousAssignments: {}, // studentId -> roleName
    isAssigned: false,
    dataSource: 'default', // 'default' | 'sheet'
    sheetUrl: '',
  };

  // =========================================================================
  // 2. DOM 요소 참조
  // =========================================================================
  const el = {
    sourceLabel: document.getElementById('sourceLabel'),
    headerActiveCount: document.getElementById('headerActiveCount'),
    headerTotalQuota: document.getElementById('headerTotalQuota'),
    headerStatusBadge: document.getElementById('headerStatusBadge'),
    selectAllCheckbox: document.getElementById('selectAllCheckbox'),
    studentListContainer: document.getElementById('studentListContainer'),
    roleListContainer: document.getElementById('roleListContainer'),
    roleSummaryQuota: document.getElementById('roleSummaryQuota'),
    addRoleBtn: document.getElementById('addRoleBtn'),
    integrityBadge: document.getElementById('integrityBadge'),
    validationNotice: document.getElementById('validationNotice'),
    resultsContainer: document.getElementById('resultsContainer'),
    toolbarStatusText: document.getElementById('toolbarStatusText'),
    assignBtn: document.getElementById('assignBtn'),
    confirmBtn: document.getElementById('confirmBtn'),
    exportCsvBtn: document.getElementById('exportCsvBtn'),
    printBtn: document.getElementById('printBtn'),
    printDate: document.getElementById('printDate'),
    // 모달 관련
    sheetModal: document.getElementById('sheetModal'),
    openModalBtn: document.getElementById('openModalBtn'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    cancelModalBtn: document.getElementById('cancelModalBtn'),
    webAppUrlInput: document.getElementById('webAppUrlInput'),
    fetchSheetBtn: document.getElementById('fetchSheetBtn'),
    resetToDefaultBtn: document.getElementById('resetToDefaultBtn'),
    toastMessage: document.getElementById('toastMessage'),
  };

  // =========================================================================
  // 3. 헬퍼 유틸리티 (안전한 셔플, 알림 등)
  // =========================================================================

  /**
   * 편향 없는 균등 무작위 배정을 위한 Fisher-Yates 셔플 알고리즘
   */
  const shuffleArray = (array) => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  /**
   * 토스트 팝업 알림 표시
   */
  let toastTimer = null;
  const showToast = (message) => {
    if (!el.toastMessage) return;
    el.toastMessage.textContent = message;
    el.toastMessage.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toastMessage.classList.add('hidden');
    }, 3000);
  };

  // =========================================================================
  // 4. 상태 계산 및 유효성 검증
  // =========================================================================

  const getActiveStudents = () => state.students.filter((s) => s.active);

  const getTotalQuota = () =>
    state.roles.reduce((sum, r) => sum + (Number(r.quota) || 0), 0);

  /**
   * 실시간 인원 수 및 정원 일치 검증
   */
  const validateAndSyncUI = () => {
    const activeCount = getActiveStudents().length;
    const totalQuota = getTotalQuota();
    const diff = activeCount - totalQuota;

    // 헤더 카운트 갱신
    el.headerActiveCount.textContent = String(activeCount);
    el.headerTotalQuota.textContent = String(totalQuota);
    el.roleSummaryQuota.textContent = String(totalQuota);

    // 전체 선택 체크박스 상태 동기화
    const allChecked = state.students.length > 0 && activeCount === state.students.length;
    const noneChecked = activeCount === 0;
    el.selectAllCheckbox.checked = allChecked;
    el.selectAllCheckbox.indeterminate = !allChecked && !noneChecked;

    // 불일치 또는 0명 처리
    if (activeCount === 0) {
      el.headerStatusBadge.textContent = '참여 학생 0명';
      el.headerStatusBadge.className = 'status-badge status-warn';
      el.validationNotice.textContent = '참여하는 학생이 없습니다. 학생을 선택해 주세요.';
      el.validationNotice.className = 'alert-banner alert-warn';
      el.toolbarStatusText.textContent = '참여 학생 0명 (배정 불가)';
      el.assignBtn.disabled = true;
    } else if (diff === 0) {
      el.headerStatusBadge.textContent = '배정 가능';
      el.headerStatusBadge.className = 'status-badge status-ready';
      el.validationNotice.textContent = `참여 인원(${activeCount}명)과 역할 정원 합계(${totalQuota}명)가 일치하여 배정 준비가 완료되었습니다.`;
      el.validationNotice.className = 'alert-banner alert-info';
      el.toolbarStatusText.textContent = `참여 ${activeCount}명 = 정원 ${totalQuota}명 (배정 가능)`;
      el.assignBtn.disabled = false;
    } else if (diff < 0) {
      const shortage = Math.abs(diff);
      el.headerStatusBadge.textContent = `${shortage}명 부족`;
      el.headerStatusBadge.className = 'status-badge status-warn';
      el.validationNotice.textContent = `참여 인원(${activeCount}명)이 역할 정원(${totalQuota}명)보다 ${shortage}명 부족합니다. 참여 학생을 더 선택하거나 역할 정원을 줄여주세요.`;
      el.validationNotice.className = 'alert-banner alert-warn';
      el.toolbarStatusText.textContent = `참여 ${activeCount}명 ≠ 정원 ${totalQuota}명 (${shortage}명 부족)`;
      el.assignBtn.disabled = true;
    } else {
      el.headerStatusBadge.textContent = `${diff}명 초과`;
      el.headerStatusBadge.className = 'status-badge status-warn';
      el.validationNotice.textContent = `참여 인원(${activeCount}명)이 역할 정원(${totalQuota}명)보다 ${diff}명 많습니다. 역할 정원을 늘리거나 참여 학생을 조정해주세요.`;
      el.validationNotice.className = 'alert-banner alert-warn';
      el.toolbarStatusText.textContent = `참여 ${activeCount}명 ≠ 정원 ${totalQuota}명 (${diff}명 초과)`;
      el.assignBtn.disabled = true;
    }
  };

  // =========================================================================
  // 5. 렌더링 함수들 (안전한 DOM 생성)
  // =========================================================================

  /**
   * 학생 명부 리스트 렌더링
   */
  const renderStudentList = () => {
    el.studentListContainer.textContent = ''; // 컨테이너 비우기

    state.students.forEach((student) => {
      const row = document.createElement('label');
      row.className = `student-row ${student.active ? '' : 'inactive'}`;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'student-checkbox';
      checkbox.checked = student.active;
      checkbox.addEventListener('change', (e) => {
        student.active = e.target.checked;
        if (student.active) {
          row.classList.remove('inactive');
        } else {
          row.classList.add('inactive');
        }
        validateAndSyncUI();
      });

      const idBadge = document.createElement('span');
      idBadge.className = 'student-id';
      idBadge.textContent = student.id;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'student-name';
      nameSpan.textContent = student.name;

      const statusSpan = document.createElement('span');
      statusSpan.className = 'student-status';
      statusSpan.textContent = student.active ? '참여' : '제외';

      row.appendChild(checkbox);
      row.appendChild(idBadge);
      row.appendChild(nameSpan);
      row.appendChild(statusSpan);

      el.studentListContainer.appendChild(row);
    });
  };

  /**
   * 역할 목록 및 정원 스태퍼 렌더링
   */
  const renderRoleList = () => {
    el.roleListContainer.textContent = '';

    state.roles.forEach((role, index) => {
      const row = document.createElement('div');
      row.className = 'role-row';

      // 역할 이름 입력
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'role-name-input';
      nameInput.value = role.name;
      nameInput.setAttribute('aria-label', `${role.name} 역할 이름`);
      nameInput.addEventListener('input', (e) => {
        role.name = e.target.value.trim() || `역할 ${index + 1}`;
        if (state.isAssigned) {
          renderAssignmentResults();
        }
      });

      // 정원 조절 스태퍼
      const stepper = document.createElement('div');
      stepper.className = 'stepper';

      const minusBtn = document.createElement('button');
      minusBtn.type = 'button';
      minusBtn.className = 'stepper-btn';
      minusBtn.textContent = '-';
      minusBtn.disabled = role.quota <= 1;
      minusBtn.setAttribute('aria-label', `${role.name} 정원 1명 감소`);
      minusBtn.addEventListener('click', () => {
        if (role.quota > 1) {
          role.quota -= 1;
          quotaSpan.textContent = String(role.quota);
          minusBtn.disabled = role.quota <= 1;
          validateAndSyncUI();
        }
      });

      const quotaSpan = document.createElement('span');
      quotaSpan.className = 'quota-val';
      quotaSpan.textContent = String(role.quota);

      const plusBtn = document.createElement('button');
      plusBtn.type = 'button';
      plusBtn.className = 'stepper-btn';
      plusBtn.textContent = '+';
      plusBtn.setAttribute('aria-label', `${role.name} 정원 1명 증가`);
      plusBtn.addEventListener('click', () => {
        role.quota += 1;
        quotaSpan.textContent = String(role.quota);
        minusBtn.disabled = false;
        validateAndSyncUI();
      });

      stepper.appendChild(minusBtn);
      stepper.appendChild(quotaSpan);
      stepper.appendChild(plusBtn);

      // 삭제 버튼 (최소 1개 역할 유지)
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn-delete-role';
      delBtn.textContent = '삭제';
      delBtn.setAttribute('aria-label', `${role.name} 삭제`);
      delBtn.disabled = state.roles.length <= 1;
      delBtn.addEventListener('click', () => {
        if (state.roles.length > 1) {
          state.roles.splice(index, 1);
          renderRoleList();
          validateAndSyncUI();
        }
      });

      row.appendChild(nameInput);
      row.appendChild(stepper);
      row.appendChild(delBtn);

      el.roleListContainer.appendChild(row);
    });
  };

  /**
   * 역할 배정 결과 렌더링
   */
  const renderAssignmentResults = () => {
    el.resultsContainer.textContent = '';

    if (!state.isAssigned) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-state';

      const icon = document.createElement('div');
      icon.className = 'empty-icon';
      icon.textContent = '🎲';

      const title = document.createElement('h3');
      title.className = 'empty-title';
      title.textContent = '아직 배정되지 않았습니다';

      const desc = document.createElement('p');
      desc.className = 'empty-desc';
      desc.textContent =
        '하단의 [역할 자동 배정] 버튼을 클릭하면 참여 인원을 대상으로 중복과 누락 없이 무작위 배정합니다.';

      emptyDiv.appendChild(icon);
      emptyDiv.appendChild(title);
      emptyDiv.appendChild(desc);

      el.resultsContainer.appendChild(emptyDiv);
      return;
    }

    state.roles.forEach((role) => {
      const card = document.createElement('div');
      card.className = 'result-card';

      const cardHeader = document.createElement('div');
      cardHeader.className = 'result-card-header';

      const roleTitle = document.createElement('span');
      roleTitle.className = 'result-role-title';
      roleTitle.textContent = role.name;

      const assignedStudents = state.currentAssignments[role.id] || [];
      const roleQuota = document.createElement('span');
      roleQuota.className = 'result-role-quota';
      roleQuota.textContent = `${assignedStudents.length} / ${role.quota}명`;

      cardHeader.appendChild(roleTitle);
      cardHeader.appendChild(roleQuota);
      card.appendChild(cardHeader);

      const studentList = document.createElement('div');
      studentList.className = 'assigned-students-list';

      assignedStudents.forEach((student) => {
        const tag = document.createElement('div');
        tag.className = 'assigned-student-tag';

        const mainInfo = document.createElement('div');
        mainInfo.className = 'student-tag-main';

        const idBadge = document.createElement('span');
        idBadge.className = 'student-tag-id';
        idBadge.textContent = student.id;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'student-tag-name';
        nameSpan.textContent = student.name;

        mainInfo.appendChild(idBadge);
        mainInfo.appendChild(nameSpan);
        tag.appendChild(mainInfo);

        // 직전 역할이 기록되어 있으면 태그 표시
        const prevRole = state.previousAssignments[student.id];
        if (prevRole) {
          const prevBadge = document.createElement('span');
          prevBadge.className = 'prev-role-badge';
          prevBadge.textContent = `직전: ${prevRole}`;
          tag.appendChild(prevBadge);
        }

        studentList.appendChild(tag);
      });

      card.appendChild(studentList);
      el.resultsContainer.appendChild(card);
    });
  };

  // =========================================================================
  // 6. 핵심 배정 알고리즘 및 무결성(중복·누락) 검증
  // =========================================================================

  /**
   * 역할 자동 배정 실행
   */
  const assignRoles = () => {
    const activeStudents = getActiveStudents();
    const totalQuota = getTotalQuota();

    // 1. 사전 검증: 인원수와 정원 일치 여부
    if (activeStudents.length !== totalQuota || activeStudents.length === 0) {
      alert('참여 인원과 역할 정원 합계가 일치해야 배정할 수 있습니다.');
      return;
    }

    // 2. Fisher-Yates 무작위 셔플 (성별, 성명 등 어떠한 인상이나 편향도 배제)
    const shuffledStudents = shuffleArray(activeStudents);

    // 3. 역할별 정원에 따라 순차 배정
    const assignments = {};
    let cursor = 0;

    state.roles.forEach((role) => {
      const quota = Number(role.quota) || 0;
      assignments[role.id] = shuffledStudents.slice(cursor, cursor + quota);
      cursor += quota;
    });

    state.currentAssignments = assignments;
    state.isAssigned = true;

    // 4. 자동 무결성 검증 (Integrity Check)
    const assignedIds = [];
    Object.values(assignments).forEach((list) => {
      list.forEach((st) => assignedIds.push(st.id));
    });

    const uniqueIdSet = new Set(assignedIds);
    const hasDuplicate = uniqueIdSet.size !== assignedIds.length;
    const hasOmission = !activeStudents.every((st) => uniqueIdSet.has(st.id));

    if (hasDuplicate || hasOmission) {
      el.integrityBadge.textContent = '배정 오류 감지';
      el.integrityBadge.className = 'integrity-pill alert-danger';
      alert('배정 중 중복 또는 누락이 발생했습니다. 다시 시도해 주세요.');
    } else {
      el.integrityBadge.textContent = `중복 0건 · 누락 0건 (${assignedIds.length}/${assignedIds.length}명 완료)`;
      el.integrityBadge.className = 'integrity-pill verified';
    }

    // 5. 툴바 버튼 활성화
    el.confirmBtn.disabled = false;
    el.exportCsvBtn.disabled = false;
    el.printBtn.disabled = false;

    // 6. 결과 렌더링
    renderAssignmentResults();
    showToast('20명 전원 1인 1역 배정이 완료되었습니다.');
  };

  /**
   * 배정 결과 확정 (직전 역할 기록 갱신 - 시트에 쓰지 않음)
   */
  const confirmAssignment = () => {
    if (!state.isAssigned) return;

    // 현재 배정 결과를 previousAssignments 맵에 저장
    const newPrevMap = {};
    state.roles.forEach((role) => {
      const list = state.currentAssignments[role.id] || [];
      list.forEach((student) => {
        newPrevMap[student.id] = role.name;
      });
    });

    state.previousAssignments = newPrevMap;
    showToast('현재 배정 결과가 직전 역할 기록으로 확정되었습니다.');

    // 결과 재렌더링하여 직전 역할 태그 갱신
    renderAssignmentResults();
  };

  // =========================================================================
  // 7. 내보내기 (CSV 다운로드 & 인쇄)
  // =========================================================================

  /**
   * CSV 내보내기 (UTF-8 BOM 포함하여 Excel 한글 깨짐 방지)
   */
  const exportToCsv = () => {
    if (!state.isAssigned) {
      alert('먼저 역할을 배정해 주세요.');
      return;
    }

    const rows = [['역할', '학생ID', '표시명', '직전역할']];

    state.roles.forEach((role) => {
      const list = state.currentAssignments[role.id] || [];
      list.forEach((student) => {
        const prevRole = state.previousAssignments[student.id] || '-';
        rows.push([role.name, student.id, student.name, prevRole]);
      });
    });

    // CSV 문자열 조립
    const csvContent =
      '\uFEFF' +
      rows
        .map((row) =>
          row
            .map((val) => `"${String(val).replace(/"/g, '""')}"`)
            .join(',')
        )
        .join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(
      today.getDate()
    ).padStart(2, '0')}`;

    link.setAttribute('href', url);
    link.setAttribute('download', `우리반_역할분담_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('CSV 파일이 다운로드되었습니다.');
  };

  /**
   * 인쇄 미리보기 실행
   */
  const printAssignment = () => {
    if (!state.isAssigned) {
      alert('먼저 역할을 배정한 후 인쇄하세요.');
      return;
    }

    const today = new Date();
    const dateStr = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;
    if (el.printDate) {
      el.printDate.textContent = `배정 일자: ${dateStr}`;
    }

    window.print();
  };

  // =========================================================================
  // 8. 구글 스프레드시트 (Apps Script) 연동
  // =========================================================================

  /**
   * Apps Script 웹앱에서 학생 데이터 가져오기
   * - 원본 성명, 성별은 읽기 응답에서 제외되며 학생ID, 표시명(이름)만 반영
   */
  const fetchSheetData = async () => {
    const url = el.webAppUrlInput.value.trim();
    if (!url) {
      alert('Apps Script 웹 앱 URL을 입력해 주세요.');
      return;
    }

    el.fetchSheetBtn.disabled = true;
    el.fetchSheetBtn.textContent = '불러오는 중...';

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`서버 응답 오류 (상태 코드: ${response.status})`);
      }

      const json = await response.json();

      if (!json || !json.data || !Array.isArray(json.data)) {
        throw new Error('응답 데이터 형식이 올바르지 않습니다.');
      }

      // 안전한 데이터 매핑 (학생ID와 이름만 취하고, 성명/성별은 일체 배제)
      const newStudents = json.data.map((item, idx) => {
        const id = item.id || item.studentId || item['학생ID'] || `S${String(idx + 1).padStart(2, '0')}`;
        const name = item.name || item.displayName || item['이름'] || `가상${String(idx + 1).padStart(2, '0')}`;
        return {
          id: String(id).trim(),
          name: String(name).trim(),
          active: true,
        };
      });

      if (newStudents.length === 0) {
        throw new Error('시트에서 유효한 학생 데이터를 찾지 못했습니다.');
      }

      state.students = newStudents;
      state.dataSource = 'sheet';
      state.sheetUrl = url;
      state.isAssigned = false;
      state.currentAssignments = {};

      el.sourceLabel.textContent = `자료 출처: 구글 스프레드시트 (${newStudents.length}명)`;
      renderStudentList();
      renderAssignmentResults();
      validateAndSyncUI();
      closeModal();
      showToast(`스프레드시트에서 ${newStudents.length}명의 데이터를 성공적으로 가져왔습니다.`);
    } catch (err) {
      console.error(err);
      alert(`스프레드시트 데이터를 가져오지 못했습니다:\n${err.message}\n\n배포 권한(모든 사용자)과 Apps Script 코드를 확인해 주세요.`);
    } finally {
      el.fetchSheetBtn.disabled = false;
      el.fetchSheetBtn.textContent = '데이터 불러오기';
    }
  };

  /**
   * 기본 가상 학생 데이터로 복원
   */
  const resetToDefault = () => {
    state.students = createDefaultStudents();
    state.roles = createDefaultRoles();
    state.dataSource = 'default';
    state.sheetUrl = '';
    state.isAssigned = false;
    state.currentAssignments = {};
    el.sourceLabel.textContent = '자료 출처: 기본 가상 데이터 (20명)';
    el.webAppUrlInput.value = '';

    renderStudentList();
    renderRoleList();
    renderAssignmentResults();
    validateAndSyncUI();
    closeModal();
    showToast('기본 가상 학생 20명 데이터로 초기화되었습니다.');
  };

  // 모달 제어
  const openModal = () => {
    el.sheetModal.classList.remove('hidden');
  };

  const closeModal = () => {
    el.sheetModal.classList.add('hidden');
  };

  // =========================================================================
  // 9. 이벤트 리스너 바인딩 및 앱 초기화
  // =========================================================================

  const bindEvents = () => {
    // 전체 선택 체크박스
    el.selectAllCheckbox.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      state.students.forEach((s) => {
        s.active = isChecked;
      });
      renderStudentList();
      validateAndSyncUI();
    });

    // 역할 추가 버튼
    el.addRoleBtn.addEventListener('click', () => {
      const newIndex = state.roles.length + 1;
      state.roles.push({
        id: `role_${Date.now()}`,
        name: `새 역할 ${newIndex}`,
        quota: 1,
      });
      renderRoleList();
      validateAndSyncUI();
    });

    // 툴바 액션 버튼들
    el.assignBtn.addEventListener('click', assignRoles);
    el.confirmBtn.addEventListener('click', confirmAssignment);
    el.exportCsvBtn.addEventListener('click', exportToCsv);
    el.printBtn.addEventListener('click', printAssignment);

    // 모달 관련
    el.openModalBtn.addEventListener('click', openModal);
    el.closeModalBtn.addEventListener('click', closeModal);
    el.cancelModalBtn.addEventListener('click', closeModal);
    el.fetchSheetBtn.addEventListener('click', fetchSheetData);
    el.resetToDefaultBtn.addEventListener('click', resetToDefault);

    // 모달 바깥 배경 클릭 시 닫기
    el.sheetModal.addEventListener('click', (e) => {
      if (e.target === el.sheetModal) {
        closeModal();
      }
    });

    // ESC 키로 모달 닫기
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !el.sheetModal.classList.contains('hidden')) {
        closeModal();
      }
    });
  };

  // 앱 시동
  const init = () => {
    renderStudentList();
    renderRoleList();
    renderAssignmentResults();
    validateAndSyncUI();
    bindEvents();
  };

  // DOM 로드 완료 후 실행
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
