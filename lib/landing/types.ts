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

export type LandingPageHeroSection = {
  id: string;
  type: 'hero';
  eyebrow: string;
  title: string;
  description: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
};

export type LandingPageStatsSection = {
  id: string;
  type: 'stats';
  eyebrow: string;
  title: string;
  description: string;
  items: LandingPageSectionStatsItem[];
};

export type LandingPageHighlightsSection = {
  id: string;
  type: 'highlights';
  eyebrow: string;
  title: string;
  description: string;
  items: LandingPageSectionHighlightItem[];
};

export type LandingPageCtaSection = {
  id: string;
  type: 'cta';
  eyebrow: string;
  title: string;
  description: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
};

export type LandingPageSection =
  | LandingPageHeroSection
  | LandingPageStatsSection
  | LandingPageHighlightsSection
  | LandingPageCtaSection;
