import Link from "next/link";

export default function Home() {
  return (
    <main>
      <img src="/logo.png" alt="동네장터 로고" />
      <h1>우리 동네 중고 거래</h1>
      <p>가까운 이웃과 안전하게 거래하세요.</p>
      <Link href="/signup">가입하러 가기</Link>
    </main>
  );
}
