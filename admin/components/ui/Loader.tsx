export default function Loader({ label = 'Loading data...' }: { label?: string }) {
  return (
    <div className="admin-loader">
      <span className="admin-loader__spinner" />
      <span>{label}</span>
    </div>
  );
}
