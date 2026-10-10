import { Hero } from '../components/Hero';
import { Row } from '../components/Row';
import { useRows } from './Home';

const GENRES = ['Action', 'Comedy', 'Drama', 'Sci-Fi', 'Thriller', 'Animation', 'Crime', 'Horror', 'Fantasy', 'Mystery', 'Romance', 'Documentary', 'Adventure', 'Family'];

export function Browse({ type }: { type: 'movie' | 'series' }) {
  const rows = useRows(type, GENRES);
  return (
    <div className="page">
      <Hero type={type} />
      <div className="rows">
        {rows.map((r) => <Row key={r.key} def={r} />)}
      </div>
    </div>
  );
}
