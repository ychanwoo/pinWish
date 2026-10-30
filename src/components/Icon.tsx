import sizes from '../icon-sizes.json'
import { asset } from '../data/places'
export function Icon({
  name,
  className = '',
}: {
  name: keyof typeof sizes
  className?: string
}) {
  const size = sizes[name]
  return (
    <img
      className={`icon ${className}`}
      src={asset(`${name}.svg`)}
      width={Number(size.width)}
      height={Number(size.height)}
      alt=""
      aria-hidden="true"
    />
  )
}
export function Brand({
  mobile = false,
  map = false,
}: {
  mobile?: boolean
  map?: boolean
}) {
  return (
    <span
      className={`brand ${mobile ? 'brand-mobile' : ''} ${map ? 'brand-map' : ''}`}
    >
      <span className="brand-symbol">
        <img src={asset('e0555.png')} alt="" />
      </span>
      <span>{map ? 'Los Angeles' : mobile ? 'PinWish' : 'pinWish'}</span>
    </span>
  )
}
