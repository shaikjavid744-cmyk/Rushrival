export function PhoneShot({ name, alt, eager = false }) {
  return (
    <div className="overflow-hidden rounded-[1.75rem] border-[5px] border-[#22346A] bg-black shadow-[0_8px_0_#121D40,0_24px_44px_rgba(0,0,0,0.5)]">
      <img src={`/screenshots/${name}.webp`} alt={alt} width="390" height="844" loading={eager ? "eager" : "lazy"} className="block h-auto w-full" data-testid={`screenshot-${name}`} />
    </div>
  );
}
