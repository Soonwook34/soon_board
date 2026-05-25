// 최상위 라우터 — plan main-page-implementation.md §12 단계 11.
// MainPage, LiveScreen, ReplayScreen에 위임. SPA fallback은 vercel.json rewrites가 처리.
// Footer 는 Switch 바깥에 단 1회 마운트되어 모든 페이지 하단에 노출 (live-map §10 단계 3, critic M8).

import { Route, Switch } from 'wouter';
import { MainPage } from './main/MainPage';
import { LiveScreen } from './live/LiveScreen';
import { ReplayScreen } from './live/ReplayScreen';
import { Footer } from './shared/Footer';

const NotFound = () => <main>Not found</main>;

export function App() {
  return (
    <>
      <Switch>
        <Route path="/" component={MainPage} />
        <Route path="/live/:key">{() => <LiveScreen />}</Route>
        <Route path="/replay/:key">{() => <ReplayScreen />}</Route>
        <Route component={NotFound} />
      </Switch>
      <Footer />
    </>
  );
}
