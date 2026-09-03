interface CrashCasesProps {
  visible: boolean
  expanded: boolean
  count: number
}

export const CrashCases = ({ visible, expanded, count }: CrashCasesProps) => (
  <section>
    <h2>Crash cases</h2>
    <p id="conditional">
      {visible && 'There are 4 lights!'}
      <span id="conditional-tail"> (status)</span>
    </p>
    <p id="ternary">
      {expanded ? (
        <>
          Text {count} and more
        </>
      ) : (
        'Alternative'
      )}{' '}
      end.
    </p>
  </section>
)
