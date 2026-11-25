import type { Rule } from '../types.ts';

const topic = (id: string, label: string, words: string[], why: string): Rule => ({
  id,
  label,
  group: 'sensitive',
  severity: 'info',
  confidence: 'estimated',
  pattern: new RegExp(words.join('|'), 'i'),
  maskToken: null,
  why,
});

export const sensitiveRules: Rule[] = [
  topic(
    'health',
    '건강 정보',
    ['우울증', '공황장애', '정신과', '진단서', '처방전', '진료기록', '질환', '암 진단', '항암', '임신', '난임', 'HIV', '에이즈', '장애 등급', '입원', '수술'],
    '건강 정보는 법에서 특별히 보호하는 민감정보입니다. 누구의 이야기인지 드러나지 않게 해 주세요.',
  ),
  topic(
    'legal',
    '법률·범죄 정보',
    ['소송', '고소', '고발', '전과', '형사', '체포', '구속', '기소', '판결문', '벌금형', '징역', '합의금'],
    '법률·범죄 관련 정보는 당사자에게 큰 피해를 줄 수 있습니다.',
  ),
  topic(
    'belief',
    '사상·신념 정보',
    ['종교', '정당', '당원', '노동조합', '노조 가입', '성적 지향', '성정체성'],
    '사상·신념 정보는 법에서 특별히 보호하는 민감정보입니다.',
  ),
];
