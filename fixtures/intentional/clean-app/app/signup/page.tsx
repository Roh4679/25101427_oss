"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function SignupPage() {
  const [agreed, setAgreed] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await supabase.auth.signUp({
      email: String(form.get("email")),
      password: String(form.get("password")),
      options: { data: { nickname: String(form.get("nickname")) } },
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <label htmlFor="email">이메일</label>
      <input id="email" name="email" type="email" autoComplete="email" required />

      <label htmlFor="password">비밀번호</label>
      <input id="password" name="password" type="password" required />

      <label htmlFor="nickname">닉네임</label>
      <input id="nickname" name="nickname" type="text" />

      <label>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} required />
        [필수] 개인정보 수집·이용 동의
      </label>

      <button type="submit" disabled={!agreed}>회원가입</button>
    </form>
  );
}
