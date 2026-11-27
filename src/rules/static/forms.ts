import { normalize } from "../../knowledge/normalize.js";
import { attr, findBlocks, findTags, isCodeFile, isHtmlFile, lex, lineIndex, visibleText } from "../../scanner/source.js";
import type { Detector, SourceFile } from "../../types.js";

// 개인정보 입력 폼 (facts.md 3장). 사실만 모은다: 필드 종류, 동의 체크박스 유무, 선택 동의 기본 체크.

type FieldKind = "email" | "phone" | "name" | "birth" | "gender" | "address" | "rrn" | "password" | "other";

interface Field {
  name: string;
  kind: FieldKind;
  label?: string; // 화면에 보이는 라벨 텍스트
  file: string;
  line: number;
}

export interface PersonalForm {
  file: string;
  line: number;
  fields: Field[];
  consent: { present: boolean; optional_prechecked: boolean };
}

const NON_FIELD_TYPES = new Set(["checkbox", "radio", "hidden", "submit", "button", "reset", "image", "file"]);

// name·id·autocomplete와 라벨 텍스트로 종류를 정한다. 순서가 중요하다 (username은 name이 아님).
const BY_NAME: [RegExp, FieldKind][] = [
  [/e-?mail/i, "email"],
  [/phone|mobile|\btel\b|^tel/i, "phone"],
  [/birth|\bdob\b|^dob/i, "birth"],
  [/gender|\bsex\b|^sex/i, "gender"],
  [/address|\baddr|zip|postcode/i, "address"],
  [/\brrn\b|^rrn|ssn|jumin|resident/i, "rrn"],
  [/^(?:full_?name|real_?name|name|last_?name|first_?name)$/i, "name"],
];
const BY_LABEL: [string, FieldKind][] = [
  ["이메일", "email"], ["전화", "phone"], ["휴대폰", "phone"], ["연락처", "phone"], ["생년월일", "birth"],
  ["성별", "gender"], ["주소", "address"], ["주민등록번호", "rrn"], ["이름", "name"], ["성명", "name"],
];

function kindOf(tag: string, attrs: string, label: string): FieldKind {
  const type = (attr(attrs, "type") ?? (tag === "input" ? "text" : "")).toLowerCase();
  if (type === "email") return "email";
  if (type === "tel") return "phone";
  if (type === "password") return "password";
  const keys = [attr(attrs, "name"), attr(attrs, "id"), attr(attrs, "autoComplete"), attr(attrs, "autocomplete")].filter(
    (v): v is string => v !== undefined && !v.startsWith("{"),
  );
  for (const [re, kind] of BY_NAME) if (keys.some((k) => re.test(k))) return kind;
  const l = normalize(label);
  for (const [word, kind] of BY_LABEL) if (l.includes(word)) return kind;
  return "other";
}

const isPersonal = (k: FieldKind) => k !== "other" && k !== "password";

// checked가 켜져 있다: defaultChecked / checked (값 없이, {true}, "checked")
function prechecked(attrs: string): boolean {
  for (const name of ["defaultChecked", "checked"]) {
    const v = attr(attrs, name);
    if (v === "" || v === "{true}" || v === "checked" || v === "true") return true;
  }
  return false;
}

function formsIn(f: SourceFile): PersonalForm[] {
  const src = f.content!;
  const code = isCodeFile(f.path) ? lex(src).code : src.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
  const line = lineIndex(src);
  const blocks = findBlocks(code, "form");
  // <form> 없이 입력란만 있는 화면(React 등)은 파일 전체를 폼 하나로 본다
  const scopes = blocks.length > 0 ? blocks.map((b) => ({ text: b.inner, offset: b.innerStart, at: b.start })) : [{ text: code, offset: 0, at: 0 }];

  return scopes.flatMap(({ text, offset, at }) => {
    const labels = findBlocks(text, "label");
    const labelFor = new Map(
      labels.flatMap((l) => {
        const open = findTags(text.slice(l.start), ["label"])[0];
        const target = open ? (attr(open.attrs, "htmlFor") ?? attr(open.attrs, "for")) : undefined;
        return target ? [[target, visibleText(l.inner)] as const] : [];
      }),
    );
    const labelAround = (pos: number) => labels.find((l) => l.start <= pos && pos < l.end);
    const labelOf = (tag: { attrs: string; start: number }) => {
      const id = attr(tag.attrs, "id");
      const wrap = labelAround(tag.start);
      return (id && labelFor.get(id)) ?? (wrap ? visibleText(wrap.inner) : "");
    };

    const fields: Field[] = [];
    let present = false;
    let optional = false;
    for (const t of findTags(text, ["input", "select", "textarea"])) {
      const type = (attr(t.attrs, "type") ?? "").toLowerCase();
      const label = labelOf(t);
      if (type === "checkbox") {
        const l = normalize(label);
        if (l.includes("동의")) present = true;
        if (l.includes("선택") && prechecked(t.attrs)) optional = true;
        continue;
      }
      if (NON_FIELD_TYPES.has(type)) continue;
      const name = attr(t.attrs, "name") ?? attr(t.attrs, "id") ?? t.name;
      fields.push({ name, kind: kindOf(t.name, t.attrs, label), ...(label ? { label } : {}), file: f.path, line: line(offset + t.start) });
    }
    if (!fields.some((x) => isPersonal(x.kind))) return [];
    return [{ file: f.path, line: line(at), fields, consent: { present, optional_prechecked: optional } }];
  });
}

const SIGNUP_API = /\.auth\.signUp\s*\(|createUserWithEmailAndPassword\s*\(/;

export const formsDetector: Detector = {
  id: "forms",
  detect(ctx) {
    const files = ctx.files.filter((f) => f.content !== undefined && (isCodeFile(f.path) || isHtmlFile(f.path)));
    const personal_forms = files.flatMap(formsIn);
    const signupApi = files.some((f) => isCodeFile(f.path) && SIGNUP_API.test(lex(f.content!).code));
    return [
      { key: "personal_forms", value: personal_forms },
      { key: "collects_personal_info", value: personal_forms.length > 0 || signupApi },
    ];
  },
};
