import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyB76Yg1wkWyo1Zf-wXzhLCzk0c_saNVPLo",
  authDomain: "cfa-hr-system.firebaseapp.com",
  projectId: "cfa-hr-system",
  storageBucket: "cfa-hr-system.firebasestorage.app",
  messagingSenderId: "457001561495",
  appId: "1:457001561495:web:536529ccccdadc119e68d2"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
