// Gallery: a dense masonry of lists, Keep-style - CSS multi-column packing
// (real masonry, no measuring/layout code). Natural height only, no resize
// grip, no drag-reorder - this view is for scanning many lists at once,
// not arranging them; switch to Bento for that.

import type { Category } from '../lib/types';
import CategoryCard from './CategoryCard';
import './galleryboard.css';

export default function GalleryBoard({ categories, ghost }: { categories: Category[]; ghost: React.ReactNode }) {
  return (
    <div className="board-gallery">
      {categories.map((c) => (
        <div className="gallery-item" key={c.id}>
          <CategoryCard category={c} />
        </div>
      ))}
      <div className="gallery-item">{ghost}</div>
    </div>
  );
}
