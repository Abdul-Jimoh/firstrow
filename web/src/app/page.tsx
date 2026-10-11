import { Footer } from "@/components/footer";
import { Hero, HowItWorks, Mark, Rules, Supporters, Totals, Upcoming } from "@/components/landing";
import { Nav } from "@/components/nav";

export default function Home() {
  return (
    <>
      <Nav />
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
