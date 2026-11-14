/**
 * 금융친구 김차장 — 뉴스 검색 중계 서버 (Google Apps Script)
 * PUMPKIN IDEA FACTORY MAKERSPACE
 *
 * 하는 일: 앱이 보낸 검색어(q)로 뉴스를 찾아 JSON으로 돌려줍니다.
 *   - 기본: Google 뉴스 RSS (API 키 필요 없음)
 *   - 선택: 네이버 뉴스 검색 API (기사 요약문이 있어 정리 품질이 더 좋음)
 *       프로젝트 설정 > 스크립트 속성에 NAVER_ID, NAVER_SECRET 을 넣으면 자동 사용
 *
 * 배포: 배포 > 새 배포 > 유형 '웹 앱'
 *       실행 사용자: 나 / 액세스 권한: 모든 사용자
 *       → 나온 웹 앱 URL(…/exec)을 앱의 ⚙ 설정에 붙여넣기
 *
 * 응답 형식: { q, provider, items:[{title, source, link, date, description}] }
 */

function doGet(e) {
  var q = (e && e.parameter && e.parameter.q || '').trim().slice(0, 80);
  if (!q) return json_({ error: 'q(검색어)가 필요해요', items: [] });

  var cache = CacheService.getScriptCache();
  var key = 'news_' + Utilities.base64EncodeWebSafe(q).slice(0, 200);
  var hit = cache.get(key);
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);

  var result;
  try {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty('NAVER_ID'), secret = props.getProperty('NAVER_SECRET');
    result = (id && secret) ? naverNews_(q, id, secret) : googleNews_(q);
  } catch (err) {
    result = { q: q, provider: 'error', error: String(err), items: [] };
  }
  var text = JSON.stringify(result);
  if (result.items && result.items.length) cache.put(key, text, 600); // 10분 캐시
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

/** Google 뉴스 RSS (한국어·한국) */
function googleNews_(q) {
  var url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(q + ' when:7d') + '&hl=ko&gl=KR&ceid=KR:ko';
  var xml = UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText();
  var channel = XmlService.parse(xml).getRootElement().getChild('channel');
  var items = channel.getChildren('item').slice(0, 10).map(function (it) {
    var src = it.getChild('source');
    return {
      title: it.getChildText('title'),
      source: src ? src.getText() : '',
      link: it.getChildText('link'),
      date: new Date(it.getChildText('pubDate')).toISOString(),
      description: '' // Google RSS 요약문은 링크 묶음이라 사용하지 않음
    };
  });
  return { q: q, provider: 'google_news_rss', items: items };
}

/** 네이버 뉴스 검색 API (developers.naver.com 에서 애플리케이션 등록 후 ID/Secret 발급) */
function naverNews_(q, id, secret) {
  var url = 'https://openapi.naver.com/v1/search/news.json?display=10&sort=date&query=' + encodeURIComponent(q);
  var res = UrlFetchApp.fetch(url, {
    headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) return googleNews_(q); // 실패 시 Google 뉴스로 대체
  var data = JSON.parse(res.getContentText());
  var items = (data.items || []).map(function (it) {
    var link = it.originallink || it.link;
    return {
      title: clean_(it.title),
      source: hostOf_(link),
      link: link,
      date: new Date(it.pubDate).toISOString(),
      description: clean_(it.description)
    };
  });
  return { q: q, provider: 'naver_news', items: items };
}

function clean_(s) {
  return String(s || '').replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}
function hostOf_(u) {
  var m = String(u || '').match(/^https?:\/\/(?:www\.|m\.)?([^\/]+)/);
  return m ? m[1] : '';
}
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** 편집기에서 직접 실행해 동작 확인용 */
function test() {
  Logger.log(doGet({ parameter: { q: '코스피 하락' } }).getContent().slice(0, 1000));
}
