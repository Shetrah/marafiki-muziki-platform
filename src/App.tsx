import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import PublicLayout from './components/PublicLayout';
import AdminLayout from './components/AdminLayout';
import AdminGuard from './components/AdminGuard';
import Home from './pages/Home';
import Events from './pages/Events';
import EventDetails from './pages/EventDetails';
import PublicTicket from './pages/PublicTicket';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import AdminEvents from './pages/AdminEvents';
import AdminEventEditor from './pages/AdminEventEditor';
import AdminScanner from './pages/AdminScanner';
import AdminArtwork from './pages/AdminArtwork';

const router = createBrowserRouter([
  {
    path:'/', element:<PublicLayout/>, children:[
      {index:true, element:<Home/>},
      {path:'events', element:<Events/>},
      {path:'events/:eventId', element:<EventDetails/>},
      {path:'ticket/:eventId/:ticketId', element:<PublicTicket/>},
    ]
  },
  {path:'/admin', element:<AdminLogin/>},
  {
    element:<AdminGuard/>, children:[
      {path:'/admin', element:<AdminLayout/>, children:[
        {path:'dashboard', element:<AdminDashboard/>},
        {path:'events', element:<AdminEvents/>},
        {path:'events/new', element:<AdminEventEditor/>},
        {path:'events/:eventId', element:<AdminEventEditor/>},
        {path:'events/:eventId/scanner', element:<AdminScanner/>},
        {path:'ai-artwork', element:<AdminArtwork/>},
      ]}
    ]
  }
]);

export default function App(){return <RouterProvider router={router}/>}
