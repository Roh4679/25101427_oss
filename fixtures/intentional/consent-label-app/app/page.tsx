import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>같이 공부할 사람을 찾아 보세요</h1>
      <p>관심 과목을 고르면 비슷한 시간대의 스터디를 추천해 드려요.</p>
      <Link href="/signup">회원가입</Link>
    </main>
  );
}
