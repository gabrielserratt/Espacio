export default function NotFound() {
  return (
    <div className="workspace" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="panel" style={{ maxWidth: 420, width: '100%', padding: '28px 26px' }}>
        <div className="eyebrow">Casa Pela</div>
        <h1 style={{ margin: '8px 0 0', font: '500 32px/1.1 var(--app-font-serif)' }}>Esta página no existe</h1>
        <p style={{ margin: '10px 0 0', color: '#6F6A62', fontSize: 13, lineHeight: 1.55 }}>Volvé al inicio desde el menú.</p>
      </div>
    </div>
  );
}
