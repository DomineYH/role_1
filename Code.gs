/**
 * 우리 반 역할분담 - Google Apps Script (Code.gs)
 * 
 * [목적]
 * 구글 스프레드시트의 '학생' 탭에서 학생 목록을 읽어와 웹 애플리케이션에 JSON 형식으로 제공합니다.
 * 
 * [보안 및 개인정보 보호 규칙]
 * - 읽기 전용(GET)으로만 동작하며, 임의의 쓰기/수정/삭제 권한은 제공하지 않습니다.
 * - 시트의 열 스키마: [학생ID | 이름 | 성명 | 성별]
 * - 중요: '성명'(실명)과 '성별' 열은 응답 객체에서 원천 제외하고,
 *   오직 '학생ID'와 '이름'(가상 표시명)만 반환하여 학생의 민감정보를 완벽히 보호합니다.
 */

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('학생');
    
    if (!sheet) {
      return createJsonResponse({
        status: 'error',
        message: "'학생' 이름의 시트(탭)를 찾을 수 없습니다. 시트 이름을 확인해 주세요."
      });
    }
    
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      return createJsonResponse({
        status: 'error',
        message: "시트에 등록된 학생 데이터가 없습니다. (헤더 행 제외 최소 1명 이상 필요)"
      });
    }
    
    // 헤더 행 검증 (1행: 학생ID | 이름 | 성명 | 성별)
    var header = data[0];
    var idColIdx = 0;   // 학생ID
    var nameColIdx = 1; // 이름 (표시명)
    
    var students = [];
    
    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var studentId = String(row[idColIdx] || '').trim();
      var displayName = String(row[nameColIdx] || '').trim();
      
      // 빈 행 건너뛰기
      if (!studentId && !displayName) {
        continue;
      }
      
      // 필수 입력 규칙 검증
      if (!studentId) {
        studentId = 'S' + (r < 10 ? '0' + r : r);
      }
      if (!displayName) {
        displayName = '가상' + (r < 10 ? '0' + r : r);
      }
      
      // [핵심] 성명(row[2])과 성별(row[3])은 절대 포함하지 않고, id와 name만 추가
      students.push({
        id: studentId,
        name: displayName
      });
    }
    
    return createJsonResponse({
      status: 'success',
      count: students.length,
      data: students
    });
    
  } catch (error) {
    return createJsonResponse({
      status: 'error',
      message: '데이터를 읽어오는 중 오류가 발생했습니다: ' + error.toString()
    });
  }
}

/**
 * CORS 및 JSON MimeType 헤더를 설정하여 응답 반환
 */
function createJsonResponse(obj) {
  var output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
