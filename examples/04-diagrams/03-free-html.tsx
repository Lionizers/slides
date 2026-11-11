// Free HTML with Tailwind, directly in the slide. Only CI colours exist.
// Same card style as <Card>: neutral surface, colour bar on the left.
<Content title="Free HTML with Tailwind">
  <div className="grid grid-cols-3 gap-6">
    {[
      { bar: 'border-steel-button', ink: 'text-steel-ink', label: 'Collect', icon: 'Inbox' as const },
      { bar: 'border-teal-button', ink: 'text-teal-ink', label: 'Analyse', icon: 'ChartBar' as const },
      { bar: 'border-violet-button', ink: 'text-violet-ink', label: 'Decide', icon: 'Signpost' as const },
    ].map((s, i) => (
      <div className={`rounded-sm border-l-[3px] bg-tint px-8 pt-7 pb-8 ${s.bar}`}>
        <div className={`mb-3 font-mono text-[16px] font-medium uppercase tracking-[0.05em] ${s.ink}`}>Step {i + 1}</div>
        <div className="flex items-center gap-3 text-[30px] font-medium"><Icon name={s.icon} /> {s.label}</div>
      </div>
    ))}
  </div>
</Content>
