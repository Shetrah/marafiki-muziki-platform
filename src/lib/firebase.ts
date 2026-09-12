import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyCYo9LBQzeokRYwdsFuAGhSrRC8Uz-QsNo',
  authDomain: 'living-room-experience.firebaseapp.com',
  projectId: 'living-room-experience',
  storageBucket: 'living-room-experience.firebasestorage.app',
  messagingSenderId: '547184049291',
  appId: '1:547184049291:web:a80bf1279b6494ed07a88e',
  measurementId: 'G-WVQ5WB3BWW',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);