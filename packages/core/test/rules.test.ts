import { describe, expect, it } from 'vitest';
import { scan } from '../src/index.ts';

// All values below are fake. Secret-like strings are split so the repo itself
// does not look like it contains real keys to secret scanners.
const ids = (text: string) => scan(text).map((f) => f.ruleId);
const find = (text: string, id: string) => scan(text).find((f) => f.ruleId === id);

const cases: Record<string, { hit: string[]; miss: string[] }> = {
  rrn: {
    hit: ['주민번호 900101-1234568 입니다', '9001011234568', '외국인 등록 900101-5234561'],
    miss: ['주문번호 9001011234567', '901301-1234568', '123456-9234567'],
  },
  card: {
    hit: ['카드 4111-1111-1111-1111', '4111 1111 1111 1111'],
    miss: ['4111-1111-1111-1112', '주문 1234567812345678'],
  },
  brn: { hit: ['사업자 123-45-67891'], miss: ['123-45-67890'] },
  email: { hit: ['문의: hong.gildong@example.com'], miss: ['@mention 만 있음', 'user@localhost'] },
  mobile: {
    hit: ['010-1234-5678', '01012345678', '+82 10-1234-5678', '+82-10-1234-5678'],
    miss: ['1010123456789', '주문번호 0101234'],
  },
  landline: { hit: ['전화 02-123-4567', '031-123-4567'], miss: ['02-1234567890', '버전 2.123.4567'] },
  account: {
    hit: ['국민은행 123456-12-123456 으로 입금', '계좌: 110-123-456789'],
    miss: ['주문번호 123456-12-123456', '은행 12-34-56'],
  },
  passport: { hit: ['여권번호 M12345678', 'M123A4567'], miss: ['M1234567', 'AM12345678'] },
  'driver-license': { hit: ['운전면허 11-12-123456-12'], miss: ['11-12-12345-12'] },
  plate: { hit: ['차량번호 12가 3456', '123나4567'], miss: ['12김3456', '12가34567'] },
  birthdate: {
    hit: ['생년월일: 1990.01.01', '생일은 1995년 3월 5일', 'DOB: 1990-12-31'],
    miss: ['생년월일: 1990.02.30', '날짜 1990.01.01'],
  },
  address: {
    hit: ['서울특별시 강남구 테헤란로 152', '수원시 영통구 매탄동 123-4', '주소: 부산광역시 해운대구 우동 1408, 101동 202호'],
    miss: ['강남구에서 만나요', '서울 어딘가'],
  },
  'address-road': { hit: ['배송지는 테헤란로 152 입니다'], miss: ['앞으로 5분 뒤', '출근길 3번 버스', '대로 10개'] },
  'address-unit': { hit: ['우리집은 101동 202호'], miss: ['1동 2호선'] },
  'name-labeled': { hit: ['성명: 홍길동', '예금주: 김철수'], miss: ['성명: 담당자', '이름은 모름'] },
  'name-honorific': {
    hit: ['홍길동님 안녕하세요', '김철수 씨가 왔다', '이영희 팀장님께'],
    miss: ['고객님 안녕하세요', '선생님께', '여러분 안녕', '사장님 오셨어요', '안녕하세요님'],
  },
  'aws-access-key': { hit: ['key=' + 'AKIA' + 'Q7X2M9K4P1R8T3V6'], miss: ['AKIA' + 'IOSFODNN7EXAMPLE', 'AKIA1234'] },
  'anthropic-key': { hit: ['sk-' + 'ant-api03-Zq8Lm2Np4Rt6Vx9Bc1Df3Gh5Jk7'], miss: ['sk-' + 'ant-short'] },
  'openai-key': { hit: ['sk-' + 'proj-Zq8Lm2Np4Rt6Vx9Bc1Df3Gh5Jk7'], miss: ['sk-' + 'aaaaaaaaaaaaaaaaaaaaaaaa', 'disk-usage-report-generator-tool'] },
  'github-token': { hit: ['ghp' + '_Zq8Lm2Np4Rt6Vx9Bc1Df3Gh5Jk7Lm2Np4Rt6Vx'], miss: ['ghp' + '_short'] },
  'slack-token': { hit: ['xox' + 'b-9038471625-Zq8Lm2Np4R'], miss: ['xox' + 'b-short'] },
  'google-api-key': { hit: ['AIza' + 'SyZq8Lm2Np4Rt6Vx9Bc1Df3Gh5Jk7Lm2Np4'], miss: ['AIza' + 'Short'] },
  'stripe-key': { hit: ['sk_' + 'live_Zq8Lm2Np4Rt6Vx9Bc1'], miss: ['sk_' + 'live_short'] },
  jwt: { hit: ['eyJ' + 'hbGciOiJIUzI1NiJ9.eyJ' + 'zdWIiOiIxMjM0In0.abcDEF123ghiJKL'], miss: ['eyJ' + 'hbGciOiJIUzI1NiJ9'] },
  bearer: { hit: ['Authorization: Bearer ' + 'Zq8Lm2Np4Rt6Vx9Bc1Df3Gh5'], miss: ['Bearer ${TOKEN}', 'Bearer aaaaaaaaaaaaaaaaaaaaaaaa'] },
  'private-key': {
    hit: ['-----BEGIN RSA ' + 'PRIVATE KEY-----\nMIIEfake\n-----END RSA ' + 'PRIVATE KEY-----'],
    miss: ['-----BEGIN PUBLIC KEY-----\nMIIfake\n-----END PUBLIC KEY-----'],
  },
  'url-password': { hit: ['postgres://admin:' + 'Zq8Lm2Np4@db.internal:5432/app'], miss: ['postgres://admin:${DB_PASS}@db', 'https://example.org/a:b'] },
  'password-config': {
    hit: ['DB_PASSWORD=' + 'Zq8Lm2Np4Rt6', '"api_key": "' + 'Zq8Lm2Np4Rt6Vx"'],
    miss: ['password=changeme', 'API_KEY=${API_KEY}', 'password: process.env.PW', 'secret=your_secret_here', 'password=********'],
  },
  ip: { hit: ['서버 8.8.8.8 접속', '192.168.0.1'], miss: ['버전 1.2.3.4.5', '999.1.1.1'] },
  mac: { hit: ['MAC 00:1A:2B:3C:4D:5E'], miss: ['00:1A:2B:3C:4D'] },
  health: { hit: ['우울증으로 정신과 다녀요'], miss: ['오늘 날씨 좋다'] },
  legal: { hit: ['소송 준비 중'], miss: ['소리가 크다'] },
};

describe.each(Object.entries(cases))('%s', (id, { hit, miss }) => {
  it.each(hit)('잡아야 함: %s', (t) => expect(ids(t)).toContain(id));
  it.each(miss)('잡으면 안 됨: %s', (t) => expect(ids(t)).not.toContain(id));
});

describe('details', () => {
  it('rrn without check digit is estimated only with hyphen/context', () => {
    expect(find('900101-1234567', 'rrn')?.confidence).toBe('estimated');
    expect(find('900101-1234568', 'rrn')?.confidence).toBe('certain');
  });
  it('foreigner number is labeled', () => {
    expect(find('900101-5234561', 'rrn')?.label).toBe('외국인등록번호');
  });
  it('private IP is info, public IP is low', () => {
    expect(find('10.0.0.1', 'ip')?.severity).toBe('info');
    expect(find('8.8.8.8', 'ip')?.severity).toBe('low');
  });
  it('named group narrows the span', () => {
    const f = find('성명: 홍길동', 'name-labeled')!;
    expect(f.value).toBe('홍길동');
  });
  it('secrets carry revoke advice', () => {
    expect(find('ghp' + '_Zq8Lm2Np4Rt6Vx9Bc1Df3Gh5Jk7Lm2Np4Rt6Vx', 'github-token')?.action).toMatch(/폐기/);
  });
  it('sensitive topics are never masked', () => {
    expect(find('우울증', 'health')?.maskToken).toBeNull();
  });
  it('group filter', () => {
    expect(scan('010-1234-5678 8.8.8.8', { groups: ['dev'] }).map((f) => f.ruleId)).toEqual(['ip']);
  });
  it('overlap keeps the higher severity', () => {
    // A card number must not also come back as an account/phone.
    expect(ids('계좌 4111-1111-1111-1111')).toEqual(['card']);
  });
});
