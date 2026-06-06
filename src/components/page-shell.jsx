export function PageShell({ title, description, actions, children }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>

        {actions ? <div className="flex gap-2">{actions}</div> : null}
      </div>

      {children}
    </div>
  );
}
