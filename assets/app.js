/* 발행전 — 발행 전 30초 검사
   모든 계산은 브라우저 안에서만 수행됩니다. 입력한 글은 어디로도 전송되지 않습니다. */
(function () {
  'use strict';

  var CFG = {
    adsenseClient: 'ca-pub-1076956391087611',
    adSlot: ''
  };

  /* ---------------------------------------------------------------- utils */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function won(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function pw(n) { return Math.pow(n, 2); }
  function std(arr) {
    if (arr.length < 2) return 0;
    var m = arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
    return Math.sqrt(arr.reduce(function (a, b) { return a + pw(b - m); }, 0) / arr.length);
  }
  function countOf(text, needle) {
    if (!needle) return 0;
    var t = text.toLowerCase(), n = needle.toLowerCase(), c = 0, i = 0;
    while ((i = t.indexOf(n, i)) !== -1) { c++; i += n.length; }
    return c;
  }
  function firstMatch(re, text) {
    var m = re.exec(text);
    if (!m) return null;
    var i = m.index;
    return { text: m[0], index: i, around: text.slice(Math.max(0, i - 26), Math.min(text.length, i + m[0].length + 26)) };
  }
  function fmtDate(d) {
    return (d.getMonth() + 1) + '-' + d.getDate() + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  /* ------------------------------------------------------------- splitting */
  var EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

  function splitSentencesOfLine(line) {
    var out = [], buf = '', hold = '';
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      buf += ch;
      if (ch === '.' || ch === '?' || ch === '!') {
        var next = line[i + 1];
        if (next === undefined || /\s/.test(next)) {
          var seg = (hold + buf).trim();
          if (/^\d+\.$/.test(seg) || /^[①-⑳]$/.test(seg) || seg.length <= 4) { hold = seg + ' '; buf = ''; continue; }
          out.push(seg);
          hold = ''; buf = '';
        }
      }
    }
    var rest = (hold + buf).trim();
    if (rest) out.push(rest);
    return out;
  }

  function parse(raw) {
    var text = String(raw || '').replace(/\r\n?/g, '\n');
    var lines = text.split('\n');
    var sentences = [];
    lines.forEach(function (line, li) {
      var t = line.trim();
      if (!t) return;
      splitSentencesOfLine(t).forEach(function (s) {
        sentences.push({ text: s, line: li, len: s.replace(/\s/g, '').length });
      });
    });
    var blocks = text.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean);
    var nonEmptyLines = lines.map(function (l) { return l.trim(); }).filter(Boolean);
    return {
      text: text,
      chars: text.length,
      charsNoSpace: text.replace(/\s/g, '').length,
      lines: lines,
      nonEmptyLines: nonEmptyLines,
      paragraphs: blocks,
      sentences: sentences
    };
  }

  /* ---------------------------------------------------------------- keyword */
  var STOPWORDS = ('그리고 하지만 그래서 그러나 또한 따라서 위한 대한 있는 없는 하는 되는 이런 저런 것은 것을 것이 수가 때가 더 잘 못 및 등 우리 여러분 정말 진짜 그냥 이제 오늘 이번 그것 이것 저것 그런 어떤 무슨 왜 어떻게 어떻게 이렇게 저렇게 합니다 있습니다 입니다 해서 하고 하면 부터 까지 보다 처럼 만큼 조차 마저 에서 으로 로써 이나 거나 든지').split(/\s+/);
  function isStop(w) { return STOPWORDS.indexOf(w) !== -1 || w.length < 2; }

  function guessKeyword(title, body) {
    var cands = String(title || '').split(/[^0-9A-Za-z가-힣]+/).filter(function (w) { return !isStop(w); });
    if (cands.length) {
      var best = cands[0], bestScore = -1;
      cands.forEach(function (w) {
        var s = countOf(body || '', w) * 10 + w.length;
        if (s > bestScore) { bestScore = s; best = w; }
      });
      return best;
    }
    var freq = {}, m;
    var re = /[가-힣]{2,6}/g;
    while ((m = re.exec(String(body || '')))) {
      var w = m[0];
      if (isStop(w)) continue;
      freq[w] = (freq[w] || 0) + 1;
    }
    var top = '', tn = 0;
    Object.keys(freq).forEach(function (k) { if (freq[k] > tn) { tn = freq[k]; top = k; } });
    return tn >= 2 ? top : '';
  }

  /* ------------------------------------------------------------------ data */
  var HIGH_RISK = ['도박', '카지노', '바카라', '작업대출', '불법대출', '원금보장', '고수익', '환전', '성인', '야동', '대출광고', '폰지', '다단계', '코인 리딩', '주식 리딩', '선물옵션'];
  var MID_RISK = ['대출', '최저가', '최대할인', '무조건', '100% 보장', '보장', '부업', '재택', '알바', '주식', '코인', '비트코인', '공짜', '무료나눔', '이벤트 당첨', '원고료', '체험단', '협찬'];
  var SHORT_URL = /(bit\.ly|me2\.do|t\.co|url\.kr|vo\.la|han\.gl|buly\.kr|abit\.ly|ntry\.ly)/i;
  var AI_CONNECTIVE = /(^|[.!?\n]\s*)(또한|따라서|그러나|하지만|즉|나아가|게다가|반면에|이처럼|요약하면|결론적으로|정리하자면|무엇보다도|아울러|한편)/g;

  /* --------------------------------------------------------------- analyze */
  function analyze(input) {
    var title = String(input.title || '').trim();
    var body = String(input.body || '');
    var channel = input.channel || 'naver';
    var p = parse(body);
    var sents = p.sentences;
    var sentLens = sents.map(function (s) { return s.len; });
    var keywords = String(input.keyword || '').trim() || guessKeyword(title, body);
    var findings = [];
    var issueMap = {}; // sentence index -> [{type,label}]

    function flag(i, type, label) {
      if (!issueMap[i]) issueMap[i] = [];
      if (issueMap[i].some(function (x) { return x.label === label; })) return;
      issueMap[i].push({ type: type, label: label });
    }
    function add(cat, level, title_, detail, fix, snippet) {
      findings.push({ cat: cat, level: level, title: title_, detail: detail, fix: fix || '', snippet: snippet || '' });
    }

    var minLen = channel === 'store' ? 700 : channel === 'etc' ? 800 : 1500;
    var kwCount = keywords ? countOf(body, keywords) : 0;
    var kwDensity = keywords && p.charsNoSpace > 0 ? (kwCount * keywords.length / p.charsNoSpace) * 100 : 0;
    var links = body.match(/(https?:\/\/[^\s)>\]]+|www\.[^\s)>\]]+)/gi) || [];
    var domains = {};
    links.forEach(function (l) {
      var d = (l.match(/^https?:\/\/([^\/\s]+)/i) || [])[1] || l;
      domains[d.toLowerCase()] = (domains[d.toLowerCase()] || 0) + 1;
    });
    var hashTags = (body.match(/#[0-9A-Za-z가-힣_]{2,}/g) || []);
    var emojis = body.match(EMOJI) || [];
    var avgSent = sentLens.length ? sentLens.reduce(function (a, b) { return a + b; }, 0) / sentLens.length : 0;
    var sentStd = std(sentLens);
    var longSents = sents.filter(function (s) { return s.len > 100; });

    // duplicate sentences
    var seen = {}, dupIdx = [];
    sents.forEach(function (s, i) {
      var key = s.text.replace(/[\s.,!?'"“”()\[\]~]/g, '');
      if (key.length < 12) return;
      if (seen[key] !== undefined) { dupIdx.push(i); flag(i, 'spam', '중복 문장'); }
      else seen[key] = i;
    });

    /* ---------------------------------------------------------- SEO */
    var seoPen = 0;
    var seoNotes = [];
    if (!title) { add('seo', 'bad', '제목이 비어 있습니다', '제목은 검색 결과에 그대로 노출되는 유일한 문장입니다. 검색어를 포함한 제목을 15~32자로 넣어 주세요.', '메인 키워드 + 무엇을 얻는지(숫자·대상·시점)를 넣으세요.'); seoPen += 18; }
    else {
      var tl = title.length;
      if (tl < 12) { add('seo', 'warn', '제목이 짧습니다 (' + tl + '자)', '12자 미만 제목은 검색 결과에서 무엇에 대한 글인지 드러나지 않습니다.', '15~32자 사이로 키워드와 혜택을 함께 넣어 보세요.'); seoPen += 8; }
      else if (tl > 45) { add('seo', 'warn', '제목이 깁니다 (' + tl + '자)', '모바일 검색 결과에서 제목이 잘립니다. 45자를 넘으면 뒤쪽 키워드가 사라집니다.', '핵심 키워드를 앞으로 옮기고 32자 안쪽으로 줄여 보세요.'); seoPen += 7; }
      if (keywords && title.indexOf(keywords) === -1) { add('seo', 'warn', '제목에 키워드가 없습니다', '제목에 <code>' + esc(keywords) + '</code>가 들어가지 않았습니다. 검색 유입은 제목 일치에서 갈립니다.', '제목 앞부분 15자 안에 <code>' + esc(keywords) + '</code>를 배치하세요.'); seoPen += 10; }
      else if (keywords) {
        var kp = title.indexOf(keywords);
        if (kp > 14) { add('seo', 'warn', '키워드가 제목 뒤쪽에 있습니다', '키워드 위치가 ' + (kp + 1) + '번째 글자입니다. 모바일에서는 앞 15자가 먼저 보입니다.', '키워드를 제목 맨 앞으로 옮겨 보세요.'); seoPen += 5; }
        else { add('seo', 'good', '제목 앞부분에 키워드가 있습니다', '제목 ' + (kp + 1) + '번째 글자에 <code>' + esc(keywords) + '</code>가 들어갔습니다.', ''); }
      }
      if (/^\[[^\]]{1,12}\]/.test(title)) { add('seo', 'warn', '대괄호 말머리가 제목을 잡아먹습니다', '말머리는 검색어와 무관한 글자로 앞자리를 차지합니다. 코너 표시는 본문 첫 줄로 옮기는 편이 낫습니다.', '예: [일상] -> 본문 첫 줄 배지로 이동.'); seoPen += 6; }
      if (/[!?]{2,}/.test(title)) { add('seo', 'warn', '제목에 특수문자가 반복됩니다', '느낌표·물음표 반복은 스팸 신호로 읽히고 클릭률도 떨어집니다.', '한 번 이하로 줄이세요.'); seoPen += 4; }
    }

    if (keywords) {
      var expectMin = Math.max(2, Math.round(p.charsNoSpace / 400));
      if (kwCount === 0) { add('seo', 'bad', '본문에 키워드가 한 번도 없습니다', '검색엔진이 이 글의 주제를 알 수 없습니다.', '본문 첫 문단과 소제목에 <code>' + esc(keywords) + '</code>를 자연스럽게 넣으세요.'); seoPen += 14; }
      else if (kwCount < expectMin) { add('seo', 'warn', '키워드 노출이 적습니다 (' + kwCount + '회)', '현재 길이면 ' + expectMin + '회 이상이 자연스럽습니다. 억지로 늘리지 말고 문단 첫 문장에 배치하세요.', ''); seoPen += 6; }
    if (p.charsNoSpace >= 800) {
      if (kwDensity > 5) { add('seo', 'bad', '키워드가 너무 자주 반복됩니다 (' + kwDensity.toFixed(1) + '%)', '같은 단어를 기계적으로 반복하면 어뷰징으로 판단될 수 있습니다.', '반복 횟수를 줄이고 대명사·유사어로 바꾸세요.'); seoPen += 12; }
      else if (kwDensity > 3.5) { add('seo', 'warn', '키워드 밀도가 높습니다 (' + kwDensity.toFixed(1) + '%)', '1~3%가 자연스러운 범위입니다.', '일부를 유사 표현으로 바꾸세요.'); seoPen += 5; }
    }
      if (p.charsNoSpace > 300 && p.text.slice(0, 300).indexOf(keywords) === -1) { add('seo', 'warn', '첫 300자에 키워드가 없습니다', '도입부에서 주제를 바로 잡아 주지 않으면 초반 이탈이 늘고 주제 신호도 약해집니다.', '첫 두 문장 안에 키워드를 한 번 넣으세요.'); seoPen += 6; }
    } else {
      add('seo', 'warn', '메인 키워드를 알 수 없습니다', '제목에서 키워드를 추출하지 못했습니다. 키워드를 직접 넣으면 밀도·위치를 정확히 봅니다.', '');
      seoPen += 4;
    }

    if (p.charsNoSpace < minLen) {
      var lv = p.charsNoSpace < minLen * 0.5 ? 'bad' : 'warn';
      add('seo', lv, '분량이 적습니다 (' + won(p.charsNoSpace) + '자 / 권장 ' + won(minLen) + '자)', channel === 'store' ? '상세페이지는 정보가 얇으면 구매 판단에 필요한 내용이 빠집니다.' : '검색 상위에 오래 머무는 글은 대체로 1,500자를 넘습니다. 얇은 글은 색인은 되어도 노출이 약합니다.', '경험·수치·비교·주의사항 중 빠진 것을 채우세요. 분량을 늘리려고 같은 말을 반복하면 역효과입니다.');
      seoPen += p.charsNoSpace < minLen * 0.5 ? 16 : 9;
    } else {
      add('seo', 'good', '분량이 충분합니다 (' + won(p.charsNoSpace) + '자)', '', '');
    }

    // subheads
    var subheads = p.nonEmptyLines.filter(function (l) {
      if (l.length > 22) return false;
      if (/[.!?]$/.test(l)) return false;
      if (/(다|요|까|죠|죠\?)$/.test(l)) return false;
      if (/^(https?:\/\/|#)/.test(l)) return false;
      return true;
    });
    if (subheads.length < 2) { add('seo', 'warn', '소제목이 ' + subheads.length + '개입니다', '긴 글을 한 덩어리로 두면 읽는 사람이 길을 잃고, 검색엔진도 구조를 잡기 어렵습니다.', '3~6개 소제목으로 나누고, 소제목마다 다른 검색어를 붙이세요.'); seoPen += 7; }
    else add('seo', 'good', '소제목 ' + subheads.length + '개로 구조가 잡혀 있습니다', '', '');

    if (channel === 'naver') {
      if (hashTags.length === 0) { add('seo', 'warn', '해시태그가 없습니다', '네이버 블로그는 태그도 검색 경로입니다. 5~10개가 적당합니다.', '본문 키워드 + 주제 태그로 5~10개를 붙이세요.'); seoPen += 4; }
      else if (hashTags.length > 15) { add('seo', 'warn', '해시태그가 너무 많습니다 (' + hashTags.length + '개)', '관련 없는 태그를 많이 붙이면 글의 주제가 흐려집니다.', '10개 이하로 줄이세요.'); seoPen += 3; }
    }

    /* --------------------------------------------------------- 저품질 */
    var spamPen = 0;
    if (links.length >= 3) {
      var worst = Object.keys(domains).sort(function (a, b) { return domains[b] - domains[a]; })[0];
      add('spam', links.length >= 6 ? 'bad' : 'warn', '외부 링크가 ' + links.length + '개입니다', '같은 도메인 반복(' + esc(worst || '') + ')은 광고 글 판정에 영향을 줍니다. 링크는 본문 아래에 몰아 두는 편이 안전합니다.', '필요한 링크만 남기고 같은 도메인 반복을 줄이세요.');
      spamPen += links.length >= 6 ? 14 : 7;
    }
    if (dupIdx.length >= 1) {
      add('spam', dupIdx.length >= 3 ? 'bad' : 'warn', '같은 문장이 ' + dupIdx.length + '번 반복됩니다', '복사·붙여넣기 흔적으로 읽히는 대표 신호입니다.', '아래 교정본에서 중복 문장이 자동으로 정리됩니다.');
      spamPen += dupIdx.length >= 3 ? 13 : 6;
    }
    var highHits = HIGH_RISK.filter(function (w) { return body.indexOf(w) !== -1; });
    var midHits = MID_RISK.filter(function (w) { return body.indexOf(w) !== -1; });
    if (highHits.length) {
      add('spam', 'bad', '주의 단어가 들어 있습니다: ' + highHits.join(', '), '이 단어들은 광고·스팸 필터가 민감하게 보는 표현입니다. 실제 내용이 아니라면 빼는 게 안전합니다.', '표현을 바꾸거나 삭제하세요.');
      spamPen += 14 + highHits.length * 2;
    }
    if (midHits.length >= 2) {
      add('spam', 'warn', '광고성으로 읽힐 수 있는 단어 ' + midHits.length + '종: ' + midHits.slice(0, 6).join(', '), '한 글에 여러 개가 겹치면 정보 글보다 홍보 글로 분류되기 쉽습니다.', '꼭 필요한 것만 남기고 나머지는 중립 표현으로 바꾸세요.');
      spamPen += 4 + midHits.length;
    }

    // max single word repetition (excluding very common)
    var wordFreq = {}, wm, wre = /[가-힣]{2,}/g;
    while ((wm = wre.exec(body))) { if (!isStop(wm[0])) wordFreq[wm[0]] = (wordFreq[wm[0]] || 0) + 1; }
    var topWord = '', topCount = 0;
    Object.keys(wordFreq).forEach(function (k) { if (wordFreq[k] > topCount) { topCount = wordFreq[k]; topWord = k; } });
    if (topCount >= 12 && topWord !== keywords) {
      add('spam', 'warn', '같은 단어가 ' + topCount + '회 반복됩니다: ' + esc(topWord), '한 단어가 과도하게 반복되면 문장이 기계적으로 읽히고 키워드 어뷰징으로 보일 수 있습니다.', '일부를 다른 표현으로 바꾸세요.');
      spamPen += 6;
    }

    var repeatChar = body.match(/([^\s가-힣A-Za-z0-9])\1{3,}/g);
    if (repeatChar) {
      add('spam', 'warn', '같은 기호가 반복됩니다 (' + esc(repeatChar[0].slice(0, 8)) + ')', 'ㅋㅋㅋ, ~~~~, !!!! 같은 반복은 내용보다 장식으로 읽힙니다.', '한두 개로 줄이세요.');
      spamPen += 4;
    }
    var phone = body.match(/0\d{1,2}[- ]?\d{3,4}[- ]?\d{4}/);
    var account = body.match(/\b\d{2,6}-\d{2,6}-\d{2,7}\b/);
    if (phone || account) {
      add('spam', 'warn', (phone ? '전화번호' : '계좌번호') + '로 보이는 숫자가 있습니다', '연락처·계좌를 본문에 그대로 적으면 스팸 필터와 개인정보 노출 위험이 함께 커집니다.', '필요하면 이미지나 별도 안내로 빼세요.');
      spamPen += 5;
    }
    if (SHORT_URL.test(body)) { add('spam', 'warn', '단축 URL이 있습니다', '단축 링크는 목적지를 알 수 없어 광고성 링크로 분류되기 쉽습니다.', '원래 주소로 바꾸세요.'); spamPen += 5; }
    if (/(무단\s?전재|재배포\s?금지|ⓒ|copyright)/i.test(body)) { add('spam', 'warn', '저작권 문구가 본문에 있습니다', '다른 곳에서 가져온 글에 붙는 문구로 보일 수 있습니다.', '직접 쓴 글이라면 빼도 됩니다.'); spamPen += 4; }
    if (p.charsNoSpace > 0 && p.charsNoSpace < 250) { add('spam', 'warn', '글이 너무 짧습니다 (' + won(p.charsNoSpace) + '자)', '250자 미만 글은 정보성보다 링크 유도 글로 판단되기 쉽습니다.', '최소 800자 이상으로 내용을 채우세요.'); spamPen += 8; }

    var paraSentCounts = p.paragraphs.map(function (b) {
      return (b.match(/[.!?](\s|$)/g) || []).length + 1;
    });
    if (p.paragraphs.length >= 6 && std(paraSentCounts) < 1.1) {
      add('spam', 'warn', '문단 길이가 지나치게 일정합니다', '모든 문단이 비슷한 길이면 템플릿으로 찍어낸 글처럼 보입니다.', '짧은 문단과 긴 문단을 섞으세요.');
      spamPen += 5;
    }
    if (emojis.length > 12) { add('spam', 'warn', '이모지가 ' + emojis.length + '개입니다', '이모지가 많으면 광고·홍보 글의 인상이 강해집니다.', '문단당 1개 이하로 줄이세요.'); spamPen += 4; }

    /* ------------------------------------------------------------- AI 티 */
    var aiPen = 0;
    var aiHits = 0;
    function aiRule(re, label, fix, pen, sentenceLevel) {
      var m = firstMatch(re, body);
      if (!m) return;
      aiHits++;
      aiPen += pen;
      if (sentenceLevel !== false) {
        sents.forEach(function (s, i) { if (re.test(s.text)) flag(i, 'ai', label); });
      }
      add('ai', 'warn', label, '예: <code>' + esc(m.text.slice(0, 60)) + '</code>', fix);
      // reset last regex state
      re.lastIndex = 0;
    }

    aiRule(/(^|\n)\s*안녕하세요[^\n]{0,20}/, '인사말로 시작합니다', '인사말은 지우고 첫 문장을 결론이나 상황으로 시작하세요.', 6);
    aiRule(/(알아보겠습니다|알아볼까요|살펴보겠습니다|살펴보도록 하겠습니다|알아보도록 하겠습니다|정리해 보겠습니다)/, '"~알아보겠습니다" 도입', '무엇을 알려줄지 바로 말하세요. 예: "월세 30만원이면 세액공제로 61만원을 돌려받습니다."', 7);
    aiRule(/(이번 (글|포스팅|콘텐츠)에서는|오늘은 [^.\n]{2,25}(알아|살펴|정리)보)/, '글 소개 문장', '검색으로 들어온 사람에게 필요한 건 소개가 아니라 첫 답입니다.', 6);
    aiRule(/(중요합니다|필수입니다|필수적입니다|효과적입니다|효율적입니다|권장합니다|고려해야 합니다)/, '"중요합니다"류 단정 표현', '단정 대신 근거와 수치를 붙이세요. 예: "안 하면 61만원을 그냥 버립니다."', 6);
    aiRule(/(라고 할 수 있습니다|라고 볼 수 있습니다|라고 말할 수 있습니다)/, '"~라고 할 수 있습니다" 회피 화법', '결론을 바로 말하세요. 회피 화법은 AI 문장의 대표 패턴입니다.', 5);
    aiRule(/(에 대해(서)?|를 통해|에 있어서|라는 점에서)/, '번역투 표현', '"~에 대해" -> "~를", "~를 통해" -> "~로"로 줄이면 사람 말투가 됩니다.', 4);
    aiRule(/(다음과 같습니다|아래와 같습니다)/, '"다음과 같습니다"', '목록을 바로 제시하세요. 안내 문장은 한 줄로 충분합니다.', 4);
    aiRule(/(도움이 되셨|도움이 되었|이상으로|마치겠습니다|마무리하겠습니다|참고하시면 좋겠)/, '상투적인 마무리', '마무리 인사 대신 다음 행동(신청 기한·확인할 것)을 남기세요.', 6);
    aiRule(/(첫째|둘째|셋째)[,\s]/, '"첫째·둘째·셋째" 나열', '항목이 3개면 소제목이나 짧은 줄로 바꾸세요. 나열식은 읽히지 않습니다.', 4);
    aiRule(/(\*\*|^#{1,6}\s|^\s*[-*]\s)/m, '마크다운 기호가 남아 있습니다', '네이버·스마트스토어 편집기에서는 **, ##, - 가 글자로 보입니다. 지우세요.', 6, false);
    aiRule(/—|–/, '줄표(—) 사용', '한국어 글에서는 쉼표나 마침표로 끊는 편이 자연스럽습니다.', 3);

    var connectives = body.match(AI_CONNECTIVE) || [];
    var connDensity = sents.length ? connectives.length / sents.length : 0;
    if (connDensity > 0.22 && connectives.length >= 3) {
      aiHits++; aiPen += 8;
      add('ai', 'warn', '접속사가 문장마다 붙습니다 (' + connectives.length + '회)', '또한·따라서·그러나가 기계적으로 반복되면 사람이 쓴 글로 읽히지 않습니다.', ' 접속사는 지우고 문장을 바로 이어도 뜻이 통합니다.');
    }
    var canCount = countOf(body, '할 수 있');
    if (sents.length >= 8 && canCount / sents.length > 0.18) {
      aiHits++; aiPen += 7;
      add('ai', 'warn', '"~할 수 있습니다"가 ' + canCount + '번 나옵니다', '가능성만 말하는 문장이 많으면 책임을 피하는 글처럼 읽힙니다.', '"~합니다"로 단정할 수 있는 것은 단정하세요.');
    }
    if (sents.length >= 6 && avgSent >= 40 && sentStd < 10) {
      aiHits++; aiPen += 7;
      add('ai', 'warn', '문장 길이가 지나치게 고릅니다', '문장 길이 표준편차가 ' + sentStd.toFixed(1) + '자입니다. 사람은 짧은 문장과 긴 문장을 섞어 씁니다.', '짧은 문장을 몇 개 넣어 리듬을 만드세요.');
    }
    var firstPerson = (body.match(/(저는|제가|나는|내가|해봤|해보니|겪어|직접 써|솔직히|당해|써봤)/g) || []).length;
    if (sents.length >= 8 && firstPerson === 0) {
      aiHits++; aiPen += 7;
      add('ai', 'warn', '경험을 말하는 문장이 없습니다', '직접 겪은 장면이 하나도 없으면 정보만 나열한 글처럼 보입니다.', '"제가 해보니", "작년에 이걸 몰라서" 같은 한 줄을 넣으세요.');
    }
    var endIng = sents.filter(function (s) { return /(입니다|합니다|입니다\.|합니다\.)$/.test(s.text.replace(/\s/g, '')); }).length;
    if (sents.length >= 8 && endIng / sents.length > 0.75) {
      aiHits++; aiPen += 6;
      add('ai', 'warn', '문장 끝이 거의 같습니다', '"~입니다/~합니다"로 끝나는 문장이 ' + Math.round(endIng / sents.length * 100) + '%입니다.', '중간에 "~해요", "~거든요", "~더라고요"를 섞으면 훨씬 사람처럼 읽힙니다.');
    }
    if (emojis.length >= 6 && emojis.length > sents.length * 0.3) {
      aiPen += 5;
      add('ai', 'warn', '이모지로 문장을 대신하고 있습니다 (' + emojis.length + '개)', '문장마다 이모지를 붙이면 생성형 도구로 만든 글의 인상이 강해집니다.', '문단당 1개 이하로 줄이세요.');
    }
    if (aiHits === 0) add('ai', 'good', 'AI 문장 패턴이 거의 없습니다', '상투어·번역투·기계적 접속사가 눈에 띄지 않습니다.', '');

    /* --------------------------------------------------------- 가독성 */
    var readPen = 0;
    if (avgSent > 75) { add('read', 'bad', '한 문장이 평균 ' + Math.round(avgSent) + '자입니다', '모바일 화면에서 한 줄이 3~4줄로 늘어집니다. 50자 안쪽이 읽기 편합니다.', '긴 문장을 마침표 기준으로 끊으세요.'); readPen += 12; }
    else if (avgSent > 55) { add('read', 'warn', '문장이 조금 깁니다 (평균 ' + Math.round(avgSent) + '자)', '평균 45~55자가 가장 읽기 좋습니다.', ''); readPen += 6; }
    else if (sents.length) add('read', 'good', '문장 길이가 읽기 좋습니다 (평균 ' + Math.round(avgSent) + '자)', '', '');

    if (longSents.length) {
      longSents.slice(0, 12).forEach(function (s) {
        var i = sents.indexOf(s);
        flag(i, 'warn', '긴 문장');
      });
      add('read', 'warn', '100자를 넘는 문장이 ' + longSents.length + '개 있습니다', '가장 긴 문장은 ' + Math.max.apply(null, longSents.map(function (s) { return s.len; })) + '자입니다. 한 번에 읽히지 않으면 건너뜁니다.', '"문장 보기" 탭에서 표시된 문장을 끊어 보세요.');
      readPen += Math.min(12, longSents.length * 3);
    }

    if (p.paragraphs.length === 1 && sents.length >= 10) {
      add('read', 'warn', '문단이 하나로 붙어 있습니다', '스크롤 없이 이어지는 덩어리는 읽는 사람이 포기합니다.', '3~5문장마다 빈 줄을 넣어 문단을 나누세요.');
      readPen += 8;
    }
    var longParas = p.paragraphs.filter(function (b) { return (b.match(/[.!?](\s|$)/g) || []).length + 1 > 7; });
    if (longParas.length) { add('read', 'warn', '문장이 7개 넘는 문단이 ' + longParas.length + '개 있습니다', '한 문단은 3~5문장이 적당합니다.', '문단을 나누세요.'); readPen += 5; }

    var brokenRatio = sents.length ? p.nonEmptyLines.length / sents.length : 0;
    if (sents.length >= 8 && brokenRatio < 0.7) {
      add('read', 'warn', '문장이 줄바꿈 없이 이어집니다', '모바일에서 벽처럼 보입니다. 문장이 끝나면 줄을 바꾸면 읽는 속도가 눈에 띄게 올라갑니다.', '아래 교정본에서 "문장마다 줄바꿈"을 켜면 자동으로 정리됩니다.');
      readPen += 5;
    }

    var polite = 0, plain = 0;
    sents.forEach(function (s) {
      var t = s.text.replace(/[\s.!?"'”’)]+$/g, '');
      if (/(습니다|입니다|ㅂ니다|해요|예요|에요|죠|네요|까요|나요|는데요)$/.test(t)) polite++;
      else if (/(다|냐|자|어|아|지|군|함|음)$/.test(t)) plain++;
    });
    if (polite >= 6 && plain >= 6 && Math.min(polite, plain) / Math.max(polite, plain) > 0.45) {
      add('read', 'warn', '존댓말과 반말이 섞여 있습니다', '말투가 바뀌면 읽는 사람이 어색함을 먼저 느낍니다.', '하나로 통일하세요.');
      readPen += 5;
    }

    /* ------------------------------------------------------------ scores */
    var seo = clamp(100 - seoPen, 0, 100);
    var spam = clamp(100 - spamPen, 0, 100);
    var ai = clamp(100 - aiPen, 0, 100);
    var read = clamp(100 - readPen, 0, 100);
    var total = Math.round(seo * 0.34 + spam * 0.26 + ai * 0.22 + read * 0.18);
    if (p.charsNoSpace < 200) total = Math.min(total, 62);

    var order = { bad: 0, warn: 1, good: 2 };
    findings.sort(function (a, b) {
      if (order[a.level] !== order[b.level]) return order[a.level] - order[b.level];
      return 0;
    });

    return {
      total: total,
      scores: { seo: seo, spam: spam, ai: ai, read: read },
      penalties: { seo: seoPen, spam: spamPen, ai: aiPen, read: readPen },
      counts: {
        chars: p.chars, charsNoSpace: p.charsNoSpace, sentences: sents.length,
        paragraphs: p.paragraphs.length, avgSent: Math.round(avgSent), lines: p.nonEmptyLines.length,
        links: links.length, hashTags: hashTags.length, emojis: emojis.length
      },
      keyword: keywords,
      keywordCount: kwCount,
      keywordDensity: kwDensity,
      findings: findings,
      sentenceIssues: issueMap,
      sentences: sents,
      title: title,
      channel: channel,
      minLen: minLen
    };
  }

  /* ------------------------------------------------------------ 교정 엔진 */
  function dedupe(text) {
    var seen = {};
    return text.split('\n').filter(function (line) {
      var key = line.replace(/[\s.,!?'"“”()\[\]~]/g, '');
      if (key.length < 12) return true;
      if (seen[key]) return false;
      seen[key] = 1;
      return true;
    }).join('\n');
  }

  var STRIP = [
    [/^\s*안녕하세요[!,.~]*\s*/gm, ''],
    [/(?:^|\n)[ \t]*(?:오늘은|이번 (?:글|포스팅|콘텐츠)에서는)[^.\n]{0,45}(?:알아보겠습니다|알아볼까요|살펴보겠습니다|살펴보도록 하겠습니다|알아보도록 하겠습니다|정리해 ?보겠습니다)[.!]?/g, ''],
    [/^[ \t]*(?:중요합니다|중요해요|필수입니다|참고하세요|주목하세요|명심하세요)\.?[ \t]*$/gm, ''],
    [/(^|\n)[ \t]*(?:또한|게다가|아울러|무엇보다도)[,.]?[ \t]+/g, '$1'],
    [/\[?치트시트\s?Vol\.?\s?\d+\]?\s*/g, ''],
    [/\s*\(?(결론적으로|요약하면|정리하자면|이처럼)[,.]?\s*/g, ' '],
    [/(도움이 되셨(?:으면|길)[^.\n]*|도움이 되었(?:으면|길)[^.\n]*)[.!]?/g, ''],
    [/(이상으로|지금까지)[^\n.]{0,25}(마치겠습니다|마무리하겠습니다)[.!]?/g, ''],
    [/[ \t]*(매우|정말|아주|굉장히|상당히|무척)[ \t]+/g, ' '],
    [/\s*(?:—|–)\s*/g, ', '],
    [/\*\*/g, ''],
    [/^\s{0,3}#{1,6}\s+/gm, ''],
    [/[ \t]{2,}/g, ' ']
  ];
  function stripPhrases(text) {
    var out = text;
    STRIP.forEach(function (pair) { out = out.replace(pair[0], pair[1]); });
    return out;
  }
  function breakSentences(text) {
    return text.split('\n').map(function (line) {
      var t = line.trim();
      if (!t) return '';
      if (/^(https?:\/\/|#|[-*•]\s|\d+[.)]\s|[■▶◆●※])/.test(t)) return t;
      var parts = splitSentencesOfLine(t);
      if (parts.length <= 1) return t;
      return parts.join('\n');
    }).join('\n');
  }
  function fillerLines(text) {
    return text.replace(/^[ \t]*(?:중요합니다|중요해요|필수입니다|참고하세요|주목하세요|명심하세요)[.!]?[ \t]*$/gm, '');
  }
  function correct(text, opts) {
    var out = String(text || '').replace(/\r\n?/g, '\n');
    if (opts.dedupe) out = dedupe(out);
    if (opts.strip) out = stripPhrases(out);
    if (opts.breaks) out = breakSentences(out);
    if (opts.strip) out = fillerLines(out);
    out = out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
    return out;
  }

  /* ------------------------------------------------------------------ UI */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var state = { channel: 'naver', last: null, prevTotal: null, tab: 'findings', cat: 'all' };

  function currentInput() {
    return { title: $('#inputTitle').value, body: $('#inputBody').value, keyword: $('#inputKeyword').value, channel: state.channel };
  }

  function setCounts() {
    var v = $('#inputBody').value;
    var parsed = parse(v);
    $('#cChars').textContent = won(v.length);
    $('#cCharsNoSpace').textContent = won(parsed.charsNoSpace);
    $('#cSent').textContent = won(parsed.sentences.length);
  }

  function gradeOf(total, badCount) {
    var g;
    if (total >= 85) g = { cls: 'g-green', label: '발행 가능', desc: '지금 눌러도 됩니다. 아래 개선 항목만 확인하세요.' };
    else if (total >= 70) g = { cls: 'g-green', label: '조금만 다듬기', desc: '발행해도 되지만, 붉은 항목 2~3개만 고치면 훨씬 좋아집니다.' };
    else if (total >= 55) g = { cls: 'g-amber', label: '수정 필요', desc: '이대로 올리면 노출과 신뢰를 잃기 쉽습니다.' };
    else g = { cls: 'g-red', label: '발행 보류', desc: '교정본을 먼저 적용하고 다시 검사하세요.' };
    // 점수가 높아도 되돌리기 어려운 붉은 항목이 남아 있으면 먼저 고지합니다.
    if (badCount > 0 && g.cls === 'g-green') {
      return { cls: 'g-amber', label: '붉은 항목 먼저', desc: '점수와 별개로, 되돌리기 어려운 붉은 항목이 ' + badCount + '개 남아 있습니다. 빨간 항목부터 고치세요.' };
    }
    return g;
  }

  function barClass(v) { return v >= 75 ? '' : v >= 55 ? 'mid' : 'low'; }

  function render(r, prevTotal) {
    state.last = r;
    var badCount0 = r.findings.filter(function (f) { return f.level === 'bad'; }).length;
    var g = gradeOf(r.total, badCount0);

    $('#resultEmpty').hidden = true;
    $('#resultBody').hidden = false;

    var C = 2 * Math.PI * 46;
    var ring = $('#ringFg');
    ring.style.strokeDasharray = C.toFixed(1);
    ring.style.strokeDashoffset = (C * (1 - r.total / 100)).toFixed(1);
    ring.style.stroke = r.total >= 70 ? '#0C7A58' : r.total >= 55 ? '#C08A2E' : '#B3261E';
    $('#scoreNum').textContent = r.total;
    var gc = $('#gradeChip');
    gc.className = 'grade ' + g.cls;
    gc.textContent = g.label;
    $('#sumDesc').textContent = g.desc;

    var badCount = r.findings.filter(function (f) { return f.level === 'bad'; }).length;
    var warnCount = r.findings.filter(function (f) { return f.level === 'warn'; }).length;
    $('#sumTitle').textContent = badCount ? '먼저 고칠 것 ' + badCount + '개' : warnCount ? '다듬을 것 ' + warnCount + '개' : '지금 상태로 좋습니다';
    var deltaEl = $('#deltaText');
    if (prevTotal !== null && prevTotal !== undefined && prevTotal !== r.total) {
      var d = r.total - prevTotal;
      deltaEl.textContent = (d > 0 ? '+' : '') + d + '점 (교정 전 ' + prevTotal + ')';
      deltaEl.style.color = d > 0 ? '#0C7A58' : '#B3261E';
      deltaEl.hidden = false;
    } else { deltaEl.hidden = true; }

    var map = [['seo', '#scSeo', '#barSeo', '#capSeo', '검색 구조'], ['spam', '#scSpam', '#barSpam', '#capSpam', '저품질 위험'], ['ai', '#scAi', '#barAi', '#capAi', 'AI 티'], ['read', '#scRead', '#barRead', '#capRead', '가독성']];
    map.forEach(function (m) {
      var v = r.scores[m[0]];
      $(m[1]).textContent = v;
      var bar = $(m[2]);
      bar.style.width = v + '%';
      bar.className = barClass(v);
    });
    $('#capSeo').textContent = '키워드 ' + r.keywordCount + '회 · 밀도 ' + r.keywordDensity.toFixed(1) + '%';
    $('#capSpam').textContent = '링크 ' + r.counts.links + ' · 태그 ' + r.counts.hashTags;
    $('#capAi').textContent = r.findings.filter(function (f) { return f.cat === 'ai' && f.level !== 'good'; }).length + '개 패턴 감지';
    $('#capRead').textContent = '평균 ' + r.counts.avgSent + '자 · ' + r.counts.paragraphs + '문단';

    renderFindings(r);
    renderFix(r);
    renderSentences(r);
    updateMbar(r, g);
    saveDraft();
    saveHistory(r);
  }

  var CAT_LABEL = { seo: '검색 구조', spam: '저품질', ai: 'AI 티', read: '가독성' };

  function renderFindings(r) {
    var list = r.findings.filter(function (f) { return state.cat === 'all' || f.cat === state.cat; });
    var miss = r.findings.length - list.length;
    var html = list.map(function (f) {
      return '<article class="finding ' + f.level + '"><div class="rail"></div><div>' +
        '<h4>' + esc(f.title) + '<span class="tag">' + CAT_LABEL[f.cat] + '</span></h4>' +
        (f.detail ? '<p>' + f.detail + '</p>' : '') +
        (f.fix ? '<p class="fix">' + f.fix + '</p>' : '') +
        '</div></article>';
    }).join('');
    if (!list.length) html = '<p class="mini" style="padding:8px 0">이 항목에서 걸린 것이 없습니다.</p>';
    $('#findings').innerHTML = html;
    $('#moreNote').textContent = miss > 0 ? '다른 항목 ' + miss + '개는 위 카테고리를 눌러 확인하세요.' : '';
  }

  function renderFix(r) {
    var opts = {
      breaks: $('#optBreaks').checked,
      strip: $('#optStrip').checked,
      dedupe: $('#optDedupe').checked
    };
    var out = correct($('#inputBody').value, opts);
    $('#fixBox').value = out;
    $('#fixStat').textContent = won(out.length) + '자 · ' + won(parse(out).sentences.length) + '문장';
  }

  function renderSentences(r) {
    var html = r.sentences.slice(0, 400).map(function (s, i) {
      var flags = r.sentenceIssues[i] || [];
      var badges = flags.map(function (f) {
        return '<span class="flag ' + (f.type === 'ai' ? 'ai' : f.type === 'spam' ? '' : 'warn') + '">' + esc(f.label) + '</span>';
      }).join('');
      return '<li>' + badges + esc(s.text) + '</li>';
    }).join('');
    $('#sentList').innerHTML = html || '<li>본문을 붙여넣으면 문장 단위로 표시됩니다.</li>';
  }

  function updateMbar(r, g) {
    if (r.counts.chars < 40) { $('#mbar').classList.remove('on'); return; }
    $('#mbar').classList.add('on');
    $('#mScore').textContent = r.total;
    $('#mGrade').textContent = g.label;
    $('#mScore').style.color = r.total >= 70 ? '#0C7A58' : r.total >= 55 ? '#A75A0B' : '#B3261E';
  }

  function run(silent) {
    var input = currentInput();
    if (parse(input.body).charsNoSpace < 20) {
      $('#resultEmpty').hidden = false;
      $('#resultBody').hidden = true;
      $('#mbar').classList.remove('on');
      if (!silent) toast('본문을 20자 이상 붙여넣어 주세요');
      return;
    }
    var prev = (state.applyBaseTotal === undefined || state.applyBaseTotal === null) ? null : state.applyBaseTotal;
    var r = analyze(input);
    render(r, prev);
    state.applyBaseTotal = null;
    if (!silent) toast('검사 완료 · ' + r.total + '점');
  }

  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  function saveDraft() {
    try {
      var d = currentInput();
      localStorage.setItem('bhj.v1.draft', JSON.stringify({ title: d.title, body: d.body, keyword: d.keyword, channel: d.channel, at: Date.now() }));
    } catch (e) {}
  }
  var lastSavedSig = '';
  function saveHistory(r) {
    try {
      var sig = (r.title || '') + '|' + r.total + '|' + r.counts.charsNoSpace;
      if (sig === lastSavedSig) return;
      lastSavedSig = sig;
      var key = 'bhj.v1.history';
      var arr = JSON.parse(localStorage.getItem(key) || '[]');
      arr.unshift({ title: r.title || '(제목 없음)', total: r.total, at: Date.now(), len: r.counts.charsNoSpace });
      localStorage.setItem(key, JSON.stringify(arr.slice(0, 10)));
      renderHistory();
    } catch (e) {}
  }
  function renderHistory() {
    try {
      var arr = JSON.parse(localStorage.getItem('bhj.v1.history') || '[]');
      var box = $('#historySection');
      if (!box) return;
      if (!arr.length) { box.hidden = true; return; }
      box.hidden = false;
      $('#historyList').innerHTML = arr.slice(0, 3).map(function (h) {
        return '<li><span>' + esc(String(h.title).slice(0, 40)) + '</span><b>' + h.total + '점</b><i>' + fmtDate(new Date(h.at)) + '</i></li>';
      }).join('');
    } catch (e) {}
  }

  /* --------------------------------------------------------------- events */
  function init() {
    if (!$('#inputBody')) { initAds(); return; }
    // channel segmented control
    $$('[data-channel]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.channel = btn.getAttribute('data-channel');
        $$('[data-channel]').forEach(function (b) { b.setAttribute('aria-selected', b === btn ? 'true' : 'false'); });
        if (state.last) run(true);
      });
    });

    ['#inputTitle', '#inputBody', '#inputKeyword'].forEach(function (sel) {
      var el = $(sel);
      var t;
      el.addEventListener('input', function () {
        if (sel === '#inputBody') setCounts();
        clearTimeout(t);
        t = setTimeout(function () {
          if (parse($('#inputBody').value).charsNoSpace >= 20) run(true);
        }, 500);
      });
      el.addEventListener('paste', function () {
        setTimeout(function () {
          if (parse($('#inputBody').value).charsNoSpace >= 20) run(true);
        }, 80);
      });
    });

    $('#btnAnalyze').addEventListener('click', function () { run(false); });

    $('#btnSample').addEventListener('click', function () {
      $('#inputTitle').value = '자취방 월세 세액공제, 11월에 챙겨야 하는 이유';
      $('#inputKeyword').value = '월세 세액공제';
      $('#inputBody').value = SAMPLE;
      setCounts();
      run(false);
    });

    $('#btnClear').addEventListener('click', function () {
      $('#inputTitle').value = ''; $('#inputKeyword').value = ''; $('#inputBody').value = '';
      setCounts();
      $('#resultEmpty').hidden = false;
      $('#resultBody').hidden = true;
      $('#mbar').classList.remove('on');
      state.last = null;
      try { localStorage.removeItem('bhj.v1.draft'); } catch (e) {}
      $('#inputBody').focus();
    });

    // tabs
    $$('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.tab = b.getAttribute('data-tab');
        $$('[data-tab]').forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
        $$('[data-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== state.tab; });
      });
    });

    // category chips
    $$('[data-cat]').forEach(function (c) {
      c.addEventListener('click', function () {
        state.cat = c.getAttribute('data-cat');
        $$('[data-cat]').forEach(function (x) { x.setAttribute('aria-pressed', x === c ? 'true' : 'false'); });
        if (state.last) renderFindings(state.last);
      });
    });

    // fix options
    ['#optBreaks', '#optStrip', '#optDedupe'].forEach(function (sel) {
      $(sel).addEventListener('change', function () { if (state.last) renderFix(state.last); });
    });

    $('#btnCopyFix').addEventListener('click', function () { copy($('#fixBox').value, '교정본을 복사했습니다'); });
    $('#btnCopyResult').addEventListener('click', function () { if (state.last) copy(summaryText(state.last), '진단 요약을 복사했습니다'); });
    $('#btnApplyFix').addEventListener('click', function () {
      var fixed = $('#fixBox').value;
      if (!fixed) return;
      state.applyBaseTotal = state.last ? state.last.total : null;
      $('#inputBody').value = fixed;
      setCounts();
      state.tab = 'findings';
      $$('[data-tab]').forEach(function (x) { x.setAttribute('aria-selected', x.getAttribute('data-tab') === 'findings' ? 'true' : 'false'); });
      $$('[data-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== 'findings'; });
      run(true);
      toast('교정본을 적용했습니다 · 점수를 다시 계산했습니다');
    });
    $('#mCopy').addEventListener('click', function () {
      $$('[data-tab]').forEach(function (x) { x.setAttribute('aria-selected', x.getAttribute('data-tab') === 'fix' ? 'true' : 'false'); });
      $$('[data-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== 'fix'; });
      state.tab = 'fix';
      $('#resultCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // keyboard
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(false); }
    });

    // restore draft
    try {
      var d = JSON.parse(localStorage.getItem('bhj.v1.draft') || 'null');
      if (d && d.body) {
        $('#inputTitle').value = d.title || '';
        $('#inputKeyword').value = d.keyword || '';
        $('#inputBody').value = d.body || '';
        if (d.channel) {
          state.channel = d.channel;
          $$('[data-channel]').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-channel') === d.channel ? 'true' : 'false'); });
        }
      }
    } catch (e) {}
    setCounts();
    renderHistory();
    initAds();
  }

  function summaryText(r) {
    var g = gradeOf(r.total, r.findings.filter(function (f) { return f.level === 'bad'; }).length);
    return '[발행전] ' + (r.title || '(제목 없음)') + '\n' +
      '종합 ' + r.total + '점 · ' + g.label + '\n' +
      '검색 구조 ' + r.scores.seo + ' / 저품질 위험 ' + r.scores.spam + ' / AI 티 ' + r.scores.ai + ' / 가독성 ' + r.scores.read + '\n' +
      '고칠 것: ' + r.findings.filter(function (f) { return f.level !== 'good'; }).slice(0, 5).map(function (f) { return f.title; }).join(' · ');
  }

  function copy(text, msg) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(msg); } catch (e) { toast('복사가 막혔습니다. 직접 선택해 주세요'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(msg); }, fallback);
    } else fallback();
  }

  function initAds() {
    if (!CFG.adsenseClient) return;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + CFG.adsenseClient;
    s.crossOrigin = 'anonymous';
    document.head.appendChild(s);
    if (CFG.adSlot) {
      $$('.ad-slot').forEach(function (el) {
        el.classList.add('is-on');
        var ins = document.createElement('ins');
        ins.className = 'adsbygoogle';
        ins.style.display = 'block';
        ins.setAttribute('data-ad-client', CFG.adsenseClient);
        ins.setAttribute('data-ad-slot', CFG.adSlot);
        ins.setAttribute('data-full-width-responsive', 'true');
        el.appendChild(ins);
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      });
    }
  }

  var SAMPLE = [
    '안녕하세요. 오늘은 자취생이 놓치기 쉬운 월세 세액공제에 대해 알아보겠습니다.',
    '',
    '월세 세액공제는 무주택 세대주가 실제로 낸 월세의 일정 비율을 세금에서 빼주는 제도입니다.',
    '또한 총급여 8,000만원 이하 근로자에게 적용되며, 연간 한도는 1,000만원입니다.',
    '따라서 총급여 5,500만원 이하라면 17%, 5,500만원 초과 8,000만원 이하라면 15%가 적용됩니다.',
    '예를 들어 월세 30만원을 내는 사람은 연 360만원의 17%인 61만원을 돌려받을 수 있습니다.',
    '',
    '신청은 연말정산 때 회사에 서류를 내거나, 5월 종합소득세 신고 때 직접 하면 됩니다.',
    '중요합니다. 계약서와 월세 이체 내역을 반드시 보관해야 합니다.',
    '또한 전입신고를 하지 않으면 공제 대상에서 빠질 수 있습니다.',
    '따라서 이사한 직후 전입신고와 확정일자를 함께 챙기는 것이 좋습니다.',
    '도움이 되셨길 바랍니다. 이상으로 마치겠습니다.'
  ].join('\n');

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.__bhj = { analyze: analyze, correct: correct, parse: parse, guessKeyword: guessKeyword };
})();
