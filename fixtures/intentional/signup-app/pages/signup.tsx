export default function Signup() {
  return (
    <form method="post" action="/api/signup">
      <label htmlFor="name">이름</label>
      <input id="name" name="name" type="text" required />

      <label htmlFor="email">이메일</label>
      <input id="email" name="email" type="email" required />

      <label htmlFor="phone">휴대폰 번호</label>
      <input id="phone" name="phone" type="tel" required />

      <label htmlFor="birth">생년월일</label>
      <input id="birth" name="birth" type="date" required />

      <label htmlFor="gender">성별</label>
      <select id="gender" name="gender">
        <option value="male">남</option>
        <option value="female">여</option>
      </select>

      <label htmlFor="address">주소</label>
      <input id="address" name="address" type="text" />

      <label>
        <input type="checkbox" name="agree_terms" required />
        [필수] 이용약관 동의
      </label>
      <label>
        <input type="checkbox" name="agree_marketing" defaultChecked />
        [선택] 마케팅 정보 수신 동의
      </label>

      <button type="submit">가입하기</button>
    </form>
  );
}
