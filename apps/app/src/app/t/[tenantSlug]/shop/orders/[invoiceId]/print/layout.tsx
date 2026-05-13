export default function PrintLayout(props: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl p-4">{props.children}</div>;
}

