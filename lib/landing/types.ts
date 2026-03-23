export type LandingHomeSection = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
};

export type LandingFaqItem = {
  id: string;
  question: string;
  answer: string;
};

export type LandingContentRecord = {
  homeSections: LandingHomeSection[];
  faqItems: LandingFaqItem[];
};

export type LandingPageContentMode = "builder" | "react";
export type LandingSectionUiPlacement = "left" | "right" | "bottom";

export type LandingPageSectionStatsItem = {
  id: string;
  value: string;
  label: string;
  description: string;
};

export type LandingPageSectionHighlightItem = {
  id: string;
  title: string;
  description: string;
};

type LandingPageSectionBase = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  uiPlacement: LandingSectionUiPlacement;
  customCode: string;
  compiledCustomCode: string | null;
};

export type LandingPageHeroSection = LandingPageSectionBase & {
  type: "hero";
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
};

export type LandingPageStatsSection = LandingPageSectionBase & {
  type: "stats";
  items: LandingPageSectionStatsItem[];
};

export type LandingPageHighlightsSection = LandingPageSectionBase & {
  type: "highlights";
  items: LandingPageSectionHighlightItem[];
};

export type LandingPageCtaSection = LandingPageSectionBase & {
  type: "cta";
  primaryCtaLabel: string;
  primaryCtaHref: string;
};

export type LandingPageSection =
  | LandingPageHeroSection
  | LandingPageStatsSection
  | LandingPageHighlightsSection
  | LandingPageCtaSection;
