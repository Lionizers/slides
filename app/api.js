// Public runtime API. Components in a deck import it as 'lionizers-slides'.
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';

export const SlideContext = createContext({
  index: 0,
  step: Infinity,
  total: 1,
  chapter: null,
  chapters: [],
  deck: { name: '', title: '', lang: 'de' },
  notesTarget: null,
});

/** Information about the slide that is rendered right now. */
export const useSlide = () => useContext(SlideContext);
