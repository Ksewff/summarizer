import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import Summarizer from "@/components/Summarizer";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.shell}>
      <SiteHeader />
      <main className={styles.main}>
        <Summarizer />
      </main>
      <SiteFooter />
    </div>
  );
}
