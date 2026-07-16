type SectionPlaceholderProps = {
  title: string;
  description: string;
};

export function SectionPlaceholder({
  title,
  description,
}: SectionPlaceholderProps) {
  return (
    <div className="rounded-2xl border border-[#2a2b30]/90 bg-gradient-to-b from-[#1c1d20] to-[#141517] p-10 shadow-[0_20px_40px_-16px_rgba(0,0,0,0.55)]">
      <h2 className="text-lg font-semibold text-white [font-family:var(--font-montserrat),sans-serif]">
        {title}
      </h2>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#8a8a8a] [font-family:var(--font-montserrat),sans-serif]">
        {description}
      </p>
    </div>
  );
}
