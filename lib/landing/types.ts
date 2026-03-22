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
