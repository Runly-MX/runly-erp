// Menu of block kinds offered at an insertion point; disabled kinds say why.
export function InsertMenu({ options, onPick }) {
  return (
    <ul className="space-y-0.5">
      {options.map((option) => (
        <li key={option.kind}>
          <button
            type="button"
            disabled={option.disabled}
            onClick={() => onPick(option.kind)}
            className="w-full cursor-pointer rounded-md px-3 py-2 text-left hover:bg-[hsl(var(--muted))] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent [@media(pointer:coarse)]:min-h-11"
          >
            <span className="block text-sm font-medium">{option.label}</span>
            <span className="block text-xs text-[hsl(var(--muted-foreground))]">{option.disabled ? option.reason : option.hint}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
