interface StaleValuesProps {
  count: number
  price: string
}

export const StaleValues = ({ count, price }: StaleValuesProps) => (
  <section>
    <h2>Stale values</h2>
    <p id="lights">There are {count} lights!</p>
    <p id="total">Total: {price} EUR</p>
  </section>
)
