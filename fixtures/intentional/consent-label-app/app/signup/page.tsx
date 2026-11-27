"use client";

export default function SignupPage() {
  return (
    <form method="post" action="/api/signup">
      <label htmlFor="email">이메일</label>
      <input id="email" name="email" type="email" required />

      <label htmlFor="password">비밀번호</label>
      <input id="password" name="password" type="password" required />

      <label>
        <input type="checkbox" name="agree_privacy" required />
        [필수] 개인정보 수집·이용 동의
      </label>
      <p>수집 항목: 이메일 / 이용 목적: 회원 관리</p>

      <button type="submit">가입하기</button>
    </form>
  );
}
