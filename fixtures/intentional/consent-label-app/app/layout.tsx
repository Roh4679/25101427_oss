import Link from "next/link";

export const metadata = { title: "스터디메이트" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {children}
        <footer>
          <Link href="/terms">이용약관</Link>
          <p>문의: hello@studymate.example</p>
        </footer>
      </body>
    </html>
  );
}
