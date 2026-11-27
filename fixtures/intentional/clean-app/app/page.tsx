import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>모임 기록을 한곳에</h1>
      <Image src="/hero.png" alt="모임 일정을 정리한 화면" width={640} height={360} />
      <p>모임 일정과 회비를 함께 정리하세요.</p>
      <Link href="/signup">회원가입하고 시작하기</Link>
    </main>
  );
}
