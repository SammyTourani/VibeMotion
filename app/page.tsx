"use client";

import { useEffect } from "react";
import Navbar from "@/components/landing/Navbar";
import HeroSection from "@/components/landing/HeroSection";
import FeatureCards from "@/components/landing/FeatureCards";
import HowItWorks from "@/components/landing/HowItWorks";
import PricingTeaser from "@/components/landing/PricingTeaser";
import TechStack from "@/components/landing/TechStack";
import Footer from "@/components/landing/Footer";

export default function Home() {
  // Set body class for landing page styles
  useEffect(() => {
    document.body.classList.add("landing-page");
    document.body.classList.remove("editor-page");
    return () => {
      document.body.classList.remove("landing-page");
    };
  }, []);

  return (
    <main className="min-h-screen bg-black text-white">
      <Navbar />
      <HeroSection />
      <FeatureCards />
      <HowItWorks />
      <PricingTeaser />
      <TechStack />
      <Footer />
    </main>
  );
}
