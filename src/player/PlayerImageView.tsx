/* Full-screen image display for the player window: an image attached to a
   note or whiteboard, pushed by the GM. */

export function PlayerImageView({ src, name }: { src: string; name?: string }) {
  return (
    <div className="pw-image-wrap">
      <img className="pw-image" src={src} alt={name ?? ''} />
      {name && <div className="pw-image-caption">{name}</div>}
    </div>
  );
}
