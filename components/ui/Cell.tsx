export function Cell({
  index,
  title,
  aside,
  className = '',
  children,
  id,
}: {
  index: string
  title: string
  aside?: React.ReactNode
  className?: string
  children: React.ReactNode
  id?: string
}) {
  const headingId = id ?? `cell-${index}`
  return (
    <section className={`cell ${className}`} aria-labelledby={headingId}>
      <div className="cell-head">
        <h2 className="label" id={headingId}>
          <b>{index}</b>
          <span className="sr-only"> </span>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}
