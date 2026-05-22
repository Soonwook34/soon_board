// 최상위 라우터 — plan main-page-implementation.md §12 단계 11.
// MainPage, LiveScreen, ReplayScreen에 위임. SPA fallback은 vercel.json rewrites가 처리.

import { Route, Switch } from 'wouter';
import { MainPage } from './main/MainPage';
import { LiveScreen } from './live/LiveScreen';
import { ReplayScreen } from './live/ReplayScreen';

const NotFound = () => <main>Not found</main>;

export function App() {
  return (
    <Switch>
      <Route path="/" component={MainPage} />
      <Route path="/live/:key">{() => <LiveScreen />}</Route>
      <Route path="/replay/:key">{() => <ReplayScreen />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}
