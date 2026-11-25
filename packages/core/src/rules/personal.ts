import type { Rule } from '../types.ts';
import { brnChecksum, digits, isValidDate, luhn, near, rrnChecksum, rrnDateValid } from '../validators/index.ts';

const B = '(?<![\\w-])'; // left boundary: no digit/letter/hyphen
const E = '(?![\\w-])'; // right boundary
const BANK = /은행|입금|계좌|송금|이체|예금주|농협|국민|신한|우리|하나|기업|카카오뱅크|토스|케이뱅크|새마을|우체국|수협|신협|SC제일|씨티|bank/i;
const ADDR = /주소|거주|사는|살아|배송|택배|자택|이사|address/i;

const SURNAMES = new Set(
  '김이박최정강조윤장임한오서신권황안송류유전홍고문양손배백허남심노하곽성차주우구민진나지엄원채천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예경봉사부'.split(''),
);
const NOT_NAME =
  /고객|회원|사용자|선생|학생|기사|손님|사장|부장|과장|대리|팀장|교수|원장|실장|이사|대표|의사|작가|형님|누님|언니|오빠|아버|어머|주인|관리|담당|신청|여러|하느|부처|임금|공주|도련|아가|마님|서방|아드|따님|환자|직원|선배|후배|동생|친구|아저|아줌|기자|변호|소장|국장|회장|총장|박사/;
const PLATE_HANGUL = '가나다라마거너더러머버서어저고노도로모보소오조구누두루무부수우주아바사자배허하호';
const ROAD_STOP =
  /^(?:앞으로|뒤로|새로|그대로|이대로|실제로|주로|따로|바로|서로|스스로|정말로|처음으로|위로|아래로|오른쪽으로|왼쪽으로|대로|별로|제대로|진짜로|마음대로|억지로|최고로|자동으로|수동으로|기본으로|임시로|추가로|정식으로|공식으로|순서대로|차례로|한길|외길|오솔길|출근길|퇴근길|귀갓길|등굣길|하굣길|산길|밤길|빗길|눈길|첫길)$/;
const UNIT = '(?!\\s*(?:분|초|시간|시|개|명|번째|번|일|주|월|년|%|살|세|원|배|km|m|kg|g|회|건|장|권|대|마리|점|위|등))';

export const personalRules: Rule[] = [
  {
    id: 'rrn',
    label: '주민등록번호',
    group: 'personal',
    severity: 'high',
    pattern: new RegExp(`${B}\\d{6}\\s?-?\\s?[1-8]\\d{6}${E}`),
    validate: (v, c) => {
      if (!rrnDateValid(v)) return false;
      const label = +digits(v)[6] >= 5 ? '외국인등록번호' : '주민등록번호';
      if (rrnChecksum(v)) return { label };
      // Numbers issued since 2020-10 have no check digit: need a hyphen or context.
      if (v.includes('-') || near(c.text, c.start, c.end, /주민|등록번호|외국인/)) return { label, confidence: 'estimated' };
      return false;
    },
    maskToken: '주민번호',
    why: '한 사람을 평생 특정하는 번호로, 유출되면 명의 도용에 쓰일 수 있습니다.',
  },
  {
    id: 'card',
    label: '카드번호',
    group: 'personal',
    severity: 'high',
    pattern: new RegExp(`${B}\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{1,7}${E}`),
    validate: (v) => luhn(v),
    maskToken: '카드',
    why: '결제에 직접 쓰일 수 있는 금융정보입니다.',
  },
  {
    id: 'brn',
    label: '사업자등록번호',
    group: 'personal',
    severity: 'medium',
    pattern: new RegExp(`${B}\\d{3}-\\d{2}-\\d{5}${E}`),
    validate: (v) => brnChecksum(v),
    maskToken: '사업자번호',
    why: '개인사업자는 사업자번호로 개인을 특정할 수 있습니다.',
  },
  {
    id: 'email',
    label: '이메일',
    group: 'personal',
    severity: 'medium',
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/,
    maskToken: '이메일',
    why: '본인에게 직접 연락하거나 계정을 찾는 데 쓰일 수 있습니다.',
  },
  {
    id: 'mobile',
    label: '휴대전화번호',
    group: 'personal',
    severity: 'high',
    pattern: /(?<![\d+])(?:\+82[- ]?\(?0?\)?1[016789]|01[016789])[- .]?\d{3,4}[- .]?\d{4}(?!\d)/,
    maskToken: '전화',
    why: '본인에게 직접 연락할 수 있는 정보입니다.',
  },
  {
    id: 'landline',
    label: '유선전화번호',
    group: 'personal',
    severity: 'medium',
    confidence: 'estimated',
    pattern: /(?<![\d-])\(?0(?:2|[3-6][1-5]|70)\)?[- .]?\d{3,4}[- .]\d{4}(?![\d-])/,
    validate: (_v, c) => (near(c.text, c.start, c.end, /전화|연락|tel|fax|팩스|☎/i) ? { confidence: 'certain' } : true),
    maskToken: '전화',
    why: '집이나 직장 전화로 본인을 찾을 수 있습니다.',
  },
  {
    id: 'account',
    label: '계좌번호',
    group: 'personal',
    severity: 'high',
    pattern: new RegExp(`${B}\\d{2,6}-\\d{2,6}-\\d{2,7}(?:-\\d{1,3})?${E}`),
    validate: (v, c) => {
      const n = digits(v).length;
      return n >= 10 && n <= 16 && near(c.text, c.start, c.end, BANK);
    },
    maskToken: '계좌',
    why: '이름과 함께 있으면 금융 사기에 쓰일 수 있습니다.',
  },
  {
    id: 'passport',
    label: '여권번호',
    group: 'personal',
    severity: 'high',
    confidence: 'estimated',
    pattern: /(?<![A-Za-z0-9])[MSRODG](?:\d{8}|\d{3}[A-Z]\d{4})(?![A-Za-z0-9])/,
    validate: (_v, c) => (near(c.text, c.start, c.end, /여권|passport/i) ? { confidence: 'certain' } : true),
    maskToken: '여권',
    why: '신분을 증명하는 번호입니다.',
  },
  {
    id: 'driver-license',
    label: '운전면허번호',
    group: 'personal',
    severity: 'high',
    pattern: new RegExp(
      `${B}(?:1[1-9]|2[0-8]|서울|부산|경기|강원|충북|충남|전북|전남|경북|경남|제주|대구|인천|광주|대전|울산)[- ]?\\d{2}-\\d{6}-\\d{2}${E}`,
    ),
    validate: (_v, c) => (near(c.text, c.start, c.end, /면허/) ? true : { confidence: 'estimated' }),
    maskToken: '면허번호',
    why: '신분을 증명하는 번호입니다.',
  },
  {
    id: 'plate',
    label: '차량번호',
    group: 'personal',
    severity: 'low',
    confidence: 'estimated',
    pattern: new RegExp(`(?<![\\d가-힣])\\d{2,3}[${PLATE_HANGUL}]\\s?\\d{4}(?!\\d)`),
    validate: (_v, c) =>
      near(c.text, c.start, c.end, /차량|차번|번호판|주차|자동차|차 번호/) ? { confidence: 'certain', severity: 'medium' } : true,
    maskToken: '차량번호',
    why: '차량 소유자를 찾는 데 쓰일 수 있습니다.',
  },
  {
    id: 'birthdate',
    label: '생년월일',
    group: 'personal',
    severity: 'medium',
    pattern:
      /(?:생년월일|생일|출생일|DOB|date of birth)\s*[:：은는이]?\s*(?<v>(?:19|20)?\d{2}\s*[.\-/년]\s*\d{1,2}\s*[.\-/월]\s*\d{1,2}(?:\s*일)?)/i,
    validate: (v) => {
      const m = v.match(/(\d+)\D+(\d+)\D+(\d+)/);
      if (!m) return false;
      const y = m[1].length === 2 ? 1900 + +m[1] : +m[1];
      return isValidDate(y, +m[2], +m[3]);
    },
    maskToken: '생년월일',
    why: '이름 등과 합치면 본인을 특정할 수 있습니다.',
  },
  {
    id: 'address',
    label: '주소',
    group: 'personal',
    severity: 'medium',
    pattern: new RegExp(
      '(?:[가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도|시)\\s+)?[가-힣]+(?:시|군|구)\\s+' +
        '(?:[가-힣0-9]+(?:대로|로|길)\\s*\\d+(?:-\\d+)?|[가-힣0-9]+(?:동|읍|면|리|가)\\s+(?:산\\s?)?\\d+(?:-\\d+)?(?:번지)?)' +
        '(?:\\s*,?\\s*\\d{1,4}동\\s*\\d{1,4}호|\\s*,?\\s*\\d{1,4}호)?',
    ),
    validate: (_v, c) => (near(c.text, c.start, c.end, ADDR) ? { severity: 'high' } : true),
    maskToken: '주소',
    why: '사는 곳이나 일하는 곳을 알 수 있습니다.',
  },
  {
    id: 'address-road',
    label: '주소(도로명)',
    group: 'personal',
    severity: 'low',
    confidence: 'estimated',
    pattern: new RegExp(`(?<![가-힣])(?<v>[가-힣0-9]{1,10}(?:대로|로|길)\\s*\\d{1,4}(?:-\\d{1,4})?)(?![\\d-])${UNIT}`),
    validate: (v, c) => {
      if (ROAD_STOP.test(v.replace(/\s*[\d-]+$/, ''))) return false;
      return near(c.text, c.start, c.end, ADDR) ? { severity: 'medium' } : true;
    },
    maskToken: '주소',
    why: '도로명과 건물번호만으로도 위치를 알 수 있습니다.',
  },
  {
    id: 'address-unit',
    label: '주소(동·호수)',
    group: 'personal',
    severity: 'low',
    confidence: 'estimated',
    pattern: /(?<![\d가-힣])\d{1,4}동\s*\d{1,4}호(?![가-힣])/,
    validate: (_v, c) => (near(c.text, c.start, c.end, ADDR) ? { severity: 'medium' } : true),
    maskToken: '주소',
    why: '아파트 동·호수는 다른 정보와 합치면 집을 특정할 수 있습니다.',
  },
  {
    id: 'name-labeled',
    label: '이름',
    group: 'personal',
    severity: 'medium',
    confidence: 'estimated',
    pattern: /(?:성명|이름|성함|예금주|보호자|수령인|받는\s?분|보내는\s?분)\s*[:：]\s*(?<v>[가-힣]{2,4})(?![가-힣])/,
    validate: (v) => !NOT_NAME.test(v),
    maskToken: '이름',
    why: '사람을 직접 가리키는 정보입니다.',
  },
  {
    id: 'name-honorific',
    label: '이름',
    group: 'personal',
    severity: 'medium',
    confidence: 'estimated',
    pattern:
      /(?<![가-힣])(?<v>[가-힣]{2,3})\s?(?:님|씨|선생님|교수님|팀장님|과장님|부장님|대리님|사장님|대표님|원장님|실장님)(?!들)/,
    validate: (v) => SURNAMES.has(v[0]) && !NOT_NAME.test(v),
    maskToken: '이름',
    why: '사람을 직접 가리키는 정보입니다.',
  },
];
