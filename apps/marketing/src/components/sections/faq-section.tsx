"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { FAQS } from "@/lib/constants";
import { COLORS } from "@/lib/colors";
import { cn } from "@/lib/utils";

/**
 * FAQ section with accordion-style expandable questions.
 */
export function FaqSection() {
  return (
    <section
      id="security"
      className="py-24 px-6 relative"
      style={{ borderTop: `1px solid ${COLORS.border.light}` }}
    >
      <div className="max-w-3xl mx-auto">
        <h2
          className="font-display text-3xl font-semibold mb-12 text-center"
          style={{ color: COLORS.ink.primary }}
        >
          Frequently Asked Questions
        </h2>

        <div className="space-y-4">
          {FAQS.map((faq, index) => (
            <FaqItem key={index} question={faq.question} answer={faq.answer} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = () => setIsOpen(!isOpen);

  return (
    <div
      className={cn(
        "glass-panel transition-all duration-300",
        isOpen && "border-l-4"
      )}
      style={{
        borderLeftColor: isOpen ? COLORS.accent.yellow : "transparent",
      }}
    >
      <button
        onClick={toggle}
        className="flex justify-between items-center p-6 w-full text-left cursor-pointer hover:bg-white/40 rounded-t-xl"
      >
        <span className="font-medium" style={{ color: COLORS.ink.primary }}>
          {question}
        </span>
        <ChevronDown
          className={cn(
            "w-5 h-5 transition-transform duration-200",
            isOpen && "rotate-180"
          )}
          style={{ color: COLORS.ink.muted }}
        />
      </button>

      {isOpen && (
        <div
          className="px-6 pb-6 text-sm leading-relaxed"
          style={{ color: COLORS.ink.secondary }}
        >
          {answer}
        </div>
      )}
    </div>
  );
}
