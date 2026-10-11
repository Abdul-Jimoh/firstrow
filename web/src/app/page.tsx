import { Footer } from "@/components/footer";
import { Hero, HowItWorks, Mark, Rules, Supporters, Totals, Upcoming } from "@/components/landing";

export default function Home() {
  return (
    <>
      <main>
        <Hero />
        <Mark />
        <HowItWorks />
        <Supporters />
        <Rules />
        <Totals />
        <Upcoming />
      </main>
      <Footer />
    </>
  );
}
