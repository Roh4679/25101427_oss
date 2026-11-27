import type { AppProps } from "next/app";
import Head from "next/head";
import Script from "next/script";
import Link from "next/link";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>동네장터</title>
      </Head>
      <Script src="https://www.googletagmanager.com/gtag/js?id=G-TEST111111" strategy="afterInteractive" />
      <Script id="ga" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-TEST111111');`}
      </Script>
      <Component {...pageProps} />
      <footer>
        <Link href="/terms">이용약관</Link>
        <span>© 동네장터</span>
      </footer>
    </>
  );
}
