import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// ====================================================================================================
// ========================== PASOS CRÍTICOS PARA QUE LA APP FUNCIONE ===============================
// ====================================================================================================

// 1. CONFIGURACIÓN DE FIREBASE EN ESTE CÓDIGO (src/App.js)
//    Tus valores de Firebase ya están integrados aquí.
const firebaseConfig = {
  apiKey: "AIzaSyBsXrraBbCmdraNnIsP0zipNxjeHkzY0KY",
  authDomain: "planeacion-taller.firebaseapp.com",
  projectId: "planeacion-taller",
  storageBucket: "planeacion-taller.firebasestorage.app",
  messagingSenderId: "774175269423",
  appId: "1:774175269423:web:d38fd01c44ceabcbc29cda",
  measurementId: "G-NYW75KJYHZ"
};

// Este es el identificador ÚNICO para tu aplicación dentro de Firestore.
// Usaremos un nombre fijo para que sea más fácil de gestionar.
// Si tu amiga y tú usan la misma URL de Vercel, ambas verán los mismos datos.
const APP_IDENTIFIER = 'planificador-colaborativo-taller';

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ====================================================================================================
// 2. CONFIGURACIÓN EN LA CONSOLA DE FIREBASE (console.firebase.google.com)
//    ESTOS PASOS SON CRUCIALES Y CAUSAN EL ERROR "Error al autenticarse" SI NO ESTÁN BIEN.
// ====================================================================================================

//    A. Habilitar Autenticación Anónima (para que no pidan usuario/contraseña)
//       - En el menú de la izquierda de la Consola de Firebase, ve a "Build" -> "Authentication".
//       - Haz clic en "Get started".
//       - Ve a la pestaña "Sign-in method" (Método de inicio de sesión).
//       - Busca "Anonymous" (Anónimo) y asegúrate de que esté **HABILITADO**.
//       - 

//    B. Configurar Reglas de Seguridad de Firestore (para que puedan leer/escribir datos)
//       - En el menú de la izquierda de la Consola de Firebase, ve a "Build" -> "Firestore Database".
//       - Haz clic en "Create database" (Crear base de datos) si es la primera vez.
//         - Elige "Start in production mode" (Iniciar en modo de producción).
//         - Selecciona una ubicación para tu base de datos (la más cercana a ti o a tus usuarios).
//         - Haz clic en "Enable" (Habilitar).
//       - Una vez que la base de datos esté creada, haz clic en la pestaña "Rules" (Reglas).
//       - 
//       - **REEMPLAZA TODAS las reglas existentes con las siguientes, EXACTAMENTE así:**
//         (¡CUIDADO! Esto hace los datos públicos para CUALQUIER usuario autenticado anónimamente en TU APP)
/*
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Reglas para las clases
    match /artifacts/planificador-colaborativo-taller/public/data/classes/{document=**} {
      allow read, write: if request.auth != null;
    }
    // NUEVAS REGLAS para los talleres
    match /artifacts/planificador-colaborativo-taller/public/data/workshops/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
*/
//       - Después de pegar las reglas, haz clic en el botón "Publish" (Publicar).
//       - 

// ====================================================================================================
// ====================================================================================================


// Custom Modal Component for alerts/confirmations
const CustomModal = ({ message, onConfirm, onCancel, showCancel = false }) => {
  if (!message) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full">
        <p className="text-lg font-semibold text-gray-800 mb-4 text-center">{message}</p>
        <div className="flex justify-center space-x-4">
          {showCancel && (
            <button
              onClick={onCancel}
              className="px-5 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
            >
              Cancelar
            </button>
          )}
          <button
            onClick={onConfirm}
            className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
};


// Main App Component
const App = () => {
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [classes, setClasses] = useState([]);
  const [workshops, setWorkshops] = useState([]); // New state for workshops
  const [newWorkshopName, setNewWorkshopName] = useState(''); // New state for new workshop input
  const [selectedWorkshop, setSelectedWorkshop] = useState(''); // Default will be set after fetching workshops
  const [newClass, setNewClass] = useState({ title: '', description: '', date: '', time: '', dayOfWeek: 'Viernes', status: 'Planeada', workshopType: '' }); // workshopType will be set dynamically
  const [editingClass, setEditingClass] = useState(null);
  const [modalMessage, setModalMessage] = useState('');
  const [modalConfirmAction, setModalConfirmAction] = useState(null);
  const [showModalCancel, setShowModalCancel] = useState(false);

  // Authentication and Firestore Initialization
  useEffect(() => {
    const authenticate = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Error during Firebase authentication:", error);
        setModalMessage("Error al conectar con la base de datos. Por favor, recarga la página o revisa la configuración de Firebase.");
        setModalConfirmAction(() => () => setModalMessage(''));
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        authenticate();
      }
      setIsAuthReady(true);
    });

    return () => unsubscribeAuth();
  }, []);

  // Fetch workshops when auth is ready
  useEffect(() => {
    if (isAuthReady && userId) {
      const workshopsCollectionRef = collection(db, `artifacts/${APP_IDENTIFIER}/public/data/workshops`);
      const unsubscribe = onSnapshot(workshopsCollectionRef, (snapshot) => {
        const fetchedWorkshops = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setWorkshops(fetchedWorkshops);
        // Set default selected workshop if none is selected or if the current one is deleted
        if (fetchedWorkshops.length > 0 && !fetchedWorkshops.some(w => w.name === selectedWorkshop)) {
          setSelectedWorkshop(fetchedWorkshops[0].name);
        } else if (fetchedWorkshops.length === 0) {
          setSelectedWorkshop(''); // No workshops available
        }
      }, (error) => {
        console.error("Error fetching workshops:", error);
        setModalMessage("Error al cargar los talleres. Intenta de nuevo.");
        setModalConfirmAction(() => () => setModalMessage(''));
      });
      return () => unsubscribe();
    }
  }, [isAuthReady, userId]); // Depend on isAuthReady and userId

  // Update newClass.workshopType when selectedWorkshop changes
  useEffect(() => {
    setNewClass(prev => ({ ...prev, workshopType: selectedWorkshop }));
  }, [selectedWorkshop]);


  // Fetch classes when auth is ready, userId is available, and selectedWorkshop changes
  useEffect(() => {
    if (isAuthReady && userId && selectedWorkshop) { // Only fetch if a workshop is selected
      const sharedClassesCollectionRef = collection(db, `artifacts/${APP_IDENTIFIER}/public/data/classes`);
      const q = query(sharedClassesCollectionRef, where("workshopType", "==", selectedWorkshop));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedClasses = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          date: doc.data().date ? new Date(doc.data().date.seconds * 1000).toISOString().split('T')[0] : ''
        }));
        fetchedClasses.sort((a, b) => {
          const dateA = new Date(a.date + 'T' + (a.time || '00:00'));
          const dateB = new Date(b.date + 'T' + (b.time || '00:00'));
          return dateA - dateB;
        });
        setClasses(fetchedClasses);
      }, (error) => {
        console.error("Error fetching classes:", error);
        setModalMessage("Error al cargar las clases. Intenta de nuevo.");
        setModalConfirmAction(() => () => setModalMessage(''));
      });

      return () => unsubscribe();
    } else if (isAuthReady && userId && !selectedWorkshop) {
      setClasses([]); // Clear classes if no workshop is selected
    }
  }, [isAuthReady, userId, selectedWorkshop]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (editingClass) {
      setEditingClass({ ...editingClass, [name]: value });
    } else {
      setNewClass({ ...newClass, [name]: value });
    }
  };

  const addOrUpdateClass = async () => {
    if (!userId) {
      setModalMessage("No se pudo conectar con la base de datos. Recarga la página.");
      setModalConfirmAction(() => () => setModalMessage(''));
      return;
    }
    if (!selectedWorkshop) {
      setModalMessage("Por favor, selecciona o añade un taller primero.");
      setModalConfirmAction(() => () => setModalMessage(''));
      return;
    }

    if (!newClass.title.trim() && !editingClass?.title.trim()) {
      setModalMessage("El título de la clase no puede estar vacío.");
      setModalConfirmAction(() => () => setModalMessage(''));
      return;
    }
    if (!newClass.date.trim() && !editingClass?.date.trim()) {
      setModalMessage("La fecha de la clase no puede estar vacía.");
      setModalConfirmAction(() => () => setModalMessage(''));
      return;
    }
    if (!newClass.time.trim() && !editingClass?.time.trim()) {
      setModalMessage("La hora de la clase no puede estar vacía.");
      setModalConfirmAction(() => () => setModalMessage(''));
      return;
    }

    try {
      const sharedClassesCollectionRef = collection(db, `artifacts/${APP_IDENTIFIER}/public/data/classes`);

      if (editingClass) {
        const classRef = doc(sharedClassesCollectionRef, editingClass.id);
        await updateDoc(classRef, {
          title: editingClass.title,
          description: editingClass.description,
          date: new Date(editingClass.date),
          time: editingClass.time,
          dayOfWeek: editingClass.dayOfWeek,
          status: editingClass.status,
          workshopType: editingClass.workshopType, // Keep original workshopType for editing
        });
        setEditingClass(null);
        setModalMessage("Clase actualizada con éxito.");
        setModalConfirmAction(() => () => setModalMessage(''));
      } else {
        await addDoc(sharedClassesCollectionRef, {
          title: newClass.title,
          description: newClass.description,
          date: new Date(newClass.date),
          time: newClass.time,
          dayOfWeek: newClass.dayOfWeek,
          status: newClass.status,
          workshopType: selectedWorkshop, // Use currently selected workshop
          createdAt: new Date(),
          createdBy: userId,
        });
        setNewClass({ title: '', description: '', date: '', time: '', dayOfWeek: 'Viernes', status: 'Planeada', workshopType: selectedWorkshop });
        setModalMessage("Clase añadida con éxito.");
        setModalConfirmAction(() => () => setModalMessage(''));
      }
    } catch (e) {
      console.error("Error adding/updating document: ", e);
      setModalMessage("Error al guardar la clase. Intenta de nuevo.");
      setModalConfirmAction(() => () => setModalMessage(''));
    }
  };

  const startEditing = (classToEdit) => {
    setEditingClass({ ...classToEdit, time: classToEdit.time || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEditing = () => {
    setEditingClass(null);
    setNewClass({ title: '', description: '', date: '', time: '', dayOfWeek: 'Viernes', status: 'Planeada', workshopType: selectedWorkshop });
  };

  const deleteClass = (id) => {
    setModalMessage("¿Estás seguro de que quieres eliminar esta clase?");
    setShowModalCancel(true);
    setModalConfirmAction(() => async () => {
      try {
        if (!userId) {
          setModalMessage("No se pudo conectar con la base de datos. Recarga la página.");
          setModalConfirmAction(() => () => setModalMessage(''));
          return;
        }
        const sharedClassesCollectionRef = collection(db, `artifacts/${APP_IDENTIFIER}/public/data/classes`);
        await deleteDoc(doc(db, `artifacts/${APP_IDENTIFIER}/public/data/classes`, id));
        setModalMessage("Clase eliminada con éxito.");
        setModalConfirmAction(() => () => setModalMessage(''));
        setShowModalCancel(false);
      } catch (e) {
        console.error("Error deleting document: ", e);
        setModalMessage("Error al eliminar la clase. Intenta de nuevo.");
        setModalConfirmAction(() => () => setModalMessage(''));
        setShowModalCancel(false);
      }
    });
  };

  const updateClassStatus = async (id, newStatus) => {
    try {
      if (!userId) {
        setModalMessage("No se pudo conectar con la base de datos. Recarga la página.");
        setModalConfirmAction(() => () => setModalMessage(''));
        return;
      }
      const sharedClassesCollectionRef = collection(db, `artifacts/${APP_IDENTIFIER}/public/data/classes`);
      const classRef = doc(sharedClassesCollectionRef, id);
      await updateDoc(classRef, { status: newStatus });
    } catch (e) {
      console.error("Error updating status: ", e);
      setModalMessage("Error al actualizar el estado. Intenta de nuevo.");
      setModalConfirmAction(() => () => setModalMessage(''));
    }
  };

  // New functions for workshop management
  const addWorkshop = async () => {
    if (!userId) {
      setModalMessage("No se pudo conectar con la base de datos. Recarga la página.");
      setModalConfirmAction(() => () => setModalMessage(''));
      return;
    }
    if (!newWorkshopName.trim()) {
      setModalMessage("El nombre del taller no puede estar vacío.");
      setModalConfirmAction(() => () => setModalMessage(''));
      return;
    }
    if (workshops.some(w => w.name.toLowerCase() === newWorkshopName.trim().toLowerCase())) {
      setModalMessage("Este taller ya existe.");
      setModalConfirmAction(() => () => setModalMessage(''));
      return;
    }

    try {
      await addDoc(collection(db, `artifacts/${APP_IDENTIFIER}/public/data/workshops`), {
        name: newWorkshopName.trim(),
        createdAt: new Date(),
        createdBy: userId,
      });
      setNewWorkshopName('');
      setModalMessage("Taller añadido con éxito.");
      setModalConfirmAction(() => () => setModalMessage(''));
    } catch (e) {
      console.error("Error adding workshop: ", e);
      setModalMessage("Error al añadir el taller. Intenta de nuevo.");
      setModalConfirmAction(() => () => setModalMessage(''));
    }
  };

  const deleteWorkshop = (id, name) => {
    setModalMessage(`¿Estás seguro de que quieres eliminar el taller "${name}"? Esto no eliminará las clases asociadas.`);
    setShowModalCancel(true);
    setModalConfirmAction(() => async () => {
      try {
        if (!userId) {
          setModalMessage("No se pudo conectar con la base de datos. Recarga la página.");
          setModalConfirmAction(() => () => setModalMessage(''));
          return;
        }
        await deleteDoc(doc(db, `artifacts/${APP_IDENTIFIER}/public/data/workshops`, id));
        setModalMessage("Taller eliminado con éxito.");
        setModalConfirmAction(() => () => setModalMessage(''));
        setShowModalCancel(false);
      } catch (e) {
        console.error("Error deleting workshop: ", e);
        setModalMessage("Error al eliminar el taller. Intenta de nuevo.");
        setModalConfirmAction(() => () => setModalMessage(''));
        setShowModalCancel(false);
      }
    });
  };


  // --- Calculations for Graphs ---
  const getProgressData = useCallback(() => {
    const totalClasses = classes.length;
    const completedClasses = classes.filter(c => c.status === 'Completada').length;
    const inProgressClasses = classes.filter(c => c.status === 'En Progreso').length;
    const plannedClasses = classes.filter(c => c.status === 'Planeada').length;

    const fridayClasses = classes.filter(c => c.dayOfWeek === 'Viernes');
    const saturdayClasses = classes.filter(c => c.dayOfWeek === 'Sábado');

    const fridayCompleted = fridayClasses.filter(c => c.status === 'Completada').length;
    const saturdayCompleted = saturdayClasses.filter(c => c.status === 'Completada').length;

    const overallStatusData = [
      { name: 'Completadas', value: completedClasses, color: '#4CAF50' },
      { name: 'En Progreso', value: inProgressClasses, color: '#FFC107' },
      { name: 'Planeadas', value: plannedClasses, color: '#2196F3' },
    ];

    const dailyProgressData = [
      {
        day: 'Viernes',
        'Clases Planeadas': fridayClasses.length,
        'Clases Completadas': fridayCompleted,
      },
      {
        day: 'Sábado',
        'Clases Planeadas': saturdayClasses.length,
        'Clases Completadas': saturdayCompleted,
      },
    ];

    return { overallStatusData, dailyProgressData, totalClasses, completedClasses };
  }, [classes]);

  const { overallStatusData, dailyProgressData, totalClasses, completedClasses } = getProgressData();

  const progressPercentage = totalClasses > 0 ? ((completedClasses / totalClasses) * 100).toFixed(1) : 0;

  const getProgressMessage = () => {
    if (totalClasses === 0) return "¡Empieza a añadir tus clases para ver el progreso!";
    if (completedClasses === totalClasses) return "¡Felicidades! ¡Todas tus clases están completadas!";
    if (completedClasses > 0 && completedClasses < totalClasses) return "¡Vas muy bien! Sigue así.";
    return "Aún hay trabajo por hacer. ¡Ánimo!";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-100 p-4 sm:p-6 font-sans text-gray-800 max-w-full overflow-x-hidden relative z-0">
      <CustomModal
        message={modalMessage}
        onConfirm={() => {
          if (modalConfirmAction) modalConfirmAction();
          setModalMessage('');
          setModalConfirmAction(null);
          setShowModalCancel(false);
        }}
        onCancel={() => {
          setModalMessage('');
          setModalConfirmAction(null);
          setShowModalCancel(false);
        }}
        showCancel={showModalCancel}
      />

      <header className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 mb-6 sm:mb-8 text-center relative z-10">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-blue-700 mb-2">Planificador de Clases para Taller</h1>
        <p className="text-base sm:text-lg text-gray-600">Organiza y sigue el progreso de tus talleres de Viernes y Sábado.</p>
        {userId && (
          <p className="text-xs sm:text-sm text-gray-500 mt-2">
            ID de Sesión Anónima (compartido para identificar tus aportaciones): <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded-md text-xs">{userId}</span>
          </p>
        )}
        {!isAuthReady && (
          <p className="text-sm text-blue-500 mt-2 animate-pulse">Conectando con la base de datos...</p>
        )}
      </header>

      {/* Main content area with flex for mobile stacking and grid for desktop columns */}
      <main className="flex flex-col lg:flex-row lg:gap-8 relative z-0">
        {/* Columna Izquierda (Formulario) */}
        <section className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 h-fit w-full lg:w-1/3 order-first relative z-20">
          <h2 className="text-xl sm:text-2xl font-bold text-blue-600 mb-4 sm:mb-6 border-b pb-2 sm:pb-3">
            {editingClass ? 'Editar Clase' : `Añadir Nueva Clase para ${selectedWorkshop || 'un Taller'}`}
          </h2>
          <div className="space-y-3 sm:space-y-4">
            {!editingClass && (
              <div>
                <label htmlFor="workshopType" className="block text-sm font-medium text-gray-700 mb-1">Tipo de Taller</label>
                <select
                  id="workshopType"
                  name="workshopType"
                  value={newClass.workshopType}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base transition duration-150 ease-in-out"
                >
                  {workshops.length === 0 && <option value="">Añade un taller...</option>}
                  {workshops.map(workshop => (
                    <option key={workshop.id} value={workshop.name}>{workshop.name}</option>
                  ))}
                </select>
              </div>
            )}
            {editingClass && (
              <div>
                <label htmlFor="workshopType" className="block text-sm font-medium text-gray-700 mb-1">Tipo de Taller</label>
                <input
                  type="text"
                  id="workshopType"
                  name="workshopType"
                  value={editingClass.workshopType}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed text-sm sm:text-base"
                />
              </div>
            )}
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">Título de la Clase</label>
              <input
                type="text"
                id="title"
                name="title"
                value={editingClass ? editingClass.title : newClass.title}
                onChange={handleInputChange}
                placeholder="Introducir título"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base transition duration-150 ease-in-out"
              />
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
              <textarea
                id="description"
                name="description"
                value={editingClass ? editingClass.description : newClass.description}
                onChange={handleInputChange}
                rows="3"
                placeholder="Detalles sobre la clase..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base transition duration-150 ease-in-out"
              ></textarea>
            </div>
            <div>
              <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
              <input
                type="date"
                id="date"
                name="date"
                value={editingClass ? editingClass.date : newClass.date}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base transition duration-150 ease-in-out"
              />
            </div>
            {/* New Time Input Field */}
            <div>
              <label htmlFor="time" className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
              <input
                type="time"
                id="time"
                name="time"
                value={editingClass ? editingClass.time : newClass.time}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base transition duration-150 ease-in-out"
              />
            </div>
            <div>
              <label htmlFor="dayOfWeek" className="block text-sm font-medium text-gray-700 mb-1">Día de la Semana</label>
              <select
                id="dayOfWeek"
                name="dayOfWeek"
                value={editingClass ? editingClass.dayOfWeek : newClass.dayOfWeek}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base transition duration-150 ease-in-out"
              >
                <option value="Viernes">Viernes</option>
                <option value="Sábado">Sábado</option>
              </select>
            </div>
            {editingClass && (
              <div>
                <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                <select
                  id="status"
                  name="status"
                  value={editingClass.status}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base transition duration-150 ease-in-out"
                >
                  <option value="Planeada">Planeada</option>
                  <option value="En Progreso">En Progreso</option>
                  <option value="Completada">Completada</option>
                </select>
              </div>
            )}
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4 mt-4 sm:mt-6">
              <button
                onClick={addOrUpdateClass}
                className="flex-1 bg-blue-600 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-blue-700 transition duration-200 ease-in-out shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 text-base sm:text-lg"
              >
                {editingClass ? 'Guardar Cambios' : 'Añadir Clase'}
              </button>
              {editingClass && (
                <button
                  onClick={cancelEditing}
                  className="flex-1 bg-gray-300 text-gray-800 font-bold py-2.5 px-4 rounded-lg hover:bg-gray-400 transition duration-200 ease-in-out shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 text-base sm:text-lg"
                >
                  Cancelar Edición
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Columna Derecha (Contenedor para Gestión de Talleres, Selector, Gráficos y Lista de Clases) */}
        <div className="flex flex-col gap-6 sm:gap-8 w-full lg:w-2/3 order-last relative z-10">
          {/* Sección de Gestión de Talleres (Ahora más arriba en móviles) */}
          <section className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 h-fit w-full">
            <h2 className="text-xl sm:text-2xl font-bold text-blue-600 mb-4 sm:mb-6 border-b pb-2 sm:pb-3">Gestión de Talleres</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="newWorkshopName" className="block text-sm font-medium text-gray-700 mb-1">Añadir Nuevo Taller</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    id="newWorkshopName"
                    name="newWorkshopName"
                    value={newWorkshopName}
                    onChange={(e) => setNewWorkshopName(e.target.value)}
                    placeholder="Ej. Taller de Música"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base transition duration-150 ease-in-out"
                  />
                  <button
                    onClick={addWorkshop}
                    className="bg-green-600 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-green-700 transition duration-200 ease-in-out shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 text-base sm:text-lg"
                  >
                    Añadir Taller
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-lg sm:text-xl font-semibold text-gray-700 mb-3 border-b border-gray-200 pb-2">Talleres Existentes</h3>
                {workshops.length === 0 ? (
                  <p className="text-gray-500 italic text-sm sm:text-base">No hay talleres añadidos aún.</p>
                ) : (
                  <ul className="space-y-2">
                    {workshops.map(workshop => (
                      <li key={workshop.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg shadow-sm border border-gray-200">
                        <span className="text-base text-gray-800">{workshop.name}</span>
                        <button
                          onClick={() => deleteWorkshop(workshop.id, workshop.name)}
                          className="px-3 py-1 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
                        >
                          Eliminar
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          {/* Workshop Selector */}
          <div className="bg-white rounded-2xl shadow-xl p-3 sm:p-4 flex flex-wrap justify-center gap-2 sm:gap-4">
            {workshops.length === 0 ? (
              <p className="text-center text-gray-500 text-sm sm:text-base">Añade talleres en la sección de "Gestión de Talleres".</p>
            ) : (
              workshops.map(workshop => (
                <button
                  key={workshop.id}
                  onClick={() => setSelectedWorkshop(workshop.name)}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm sm:text-base transition-all duration-200 ${
                    selectedWorkshop === workshop.name
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {workshop.name}
                </button>
              ))
            )}
          </div>

          {/* Sección de Gráficos de Avance */}
          <section className="bg-white rounded-2xl shadow-xl p-4 sm:p-6">
            <h2 className="text-xl sm:text-2xl font-bold text-blue-600 mb-3 sm:mb-4 border-b pb-2 sm:pb-3">Avance General ({selectedWorkshop || 'Ningún Taller Seleccionado'})</h2>
            <div className="text-center mb-3 sm:mb-4">
              <p className="text-2xl sm:text-3xl font-extrabold text-green-600">{progressPercentage}% Completado</p>
              <p className="text-base sm:text-lg text-gray-700 mt-1 sm:mt-2">{getProgressMessage()}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {/* Gráfico de Estado General */}
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg shadow-inner h-64 sm:h-72 overflow-hidden flex-none min-w-0 relative z-0">
                <h3 className="text-lg sm:text-xl font-semibold text-gray-700 mb-2 sm:mb-3">Estado de Clases</h3>
                <ResponsiveContainer width="100%" height="100%" key={selectedWorkshop + 'pie'}>
                  <PieChart>
                    <Pie
                      data={overallStatusData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      labelLine={false}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {overallStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Gráfico de Progreso por Día */}
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg shadow-inner h-64 sm:h-72 overflow-hidden flex-none min-w-0 relative z-0">
                <h3 className="text-lg sm:text-xl font-semibold text-gray-700 mb-2 sm:mb-3">Clases por Día</h3>
                <ResponsiveContainer width="100%" height="100%" key={selectedWorkshop + 'bar'}>
                  <BarChart
                    data={dailyProgressData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="Clases Planeadas" fill="#2196F3" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="Clases Completadas" fill="#4CAF50" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* Lista de Clases */}
          <section className="bg-white rounded-2xl shadow-xl p-4 sm:p-6">
            <h2 className="text-xl sm:text-2xl font-bold text-blue-600 mb-3 sm:mb-4 border-b pb-2 sm:pb-3">Mis Clases de {selectedWorkshop || 'Ningún Taller Seleccionado'}</h2>
            {classes.length === 0 ? (
              <p className="text-center text-gray-500 py-6 sm:py-8 text-base sm:text-lg">No hay clases planificadas para {selectedWorkshop} aún. ¡Añade una arriba!</p>
            ) : (
              <div className="space-y-4 sm:space-y-6">
                {['Viernes', 'Sábado'].map(day => (
                  <div key={day}>
                    <h3 className="text-lg sm:text-xl font-bold text-blue-500 mb-3 sm:mb-4 border-b-2 border-blue-200 pb-1.5 sm:pb-2">{day}</h3>
                    {classes.filter(c => c.dayOfWeek === day).length === 0 ? (
                      <p className="text-gray-500 italic ml-2 sm:ml-4 text-sm sm:text-base">No hay clases para este {day} en {selectedWorkshop}.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                        {classes.filter(c => c.dayOfWeek === day).map(cls => (
                          <div key={cls.id} className={`bg-gray-50 p-4 sm:p-5 rounded-lg shadow-sm border ${
                            cls.status === 'Completada' ? 'border-green-400' :
                            cls.status === 'En Progreso' ? 'border-yellow-400' :
                            'border-blue-300'
                          }`}>
                            <div className="flex justify-between items-start mb-1.5 sm:mb-2">
                              <h4 className="text-base sm:text-lg font-semibold text-gray-900">{cls.title}</h4>
                              <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                                cls.status === 'Completada' ? 'bg-green-100 text-green-800' :
                                cls.status === 'En Progreso' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-blue-100 text-blue-800'
                              }`}>
                                {cls.status}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mb-1.5 sm:mb-2">{cls.description || 'Sin descripción.'}</p>
                            {/* Display date and time */}
                            <p className="text-xs sm:text-sm text-gray-500 mb-2 sm:mb-3">Fecha: {cls.date} {cls.time ? `(${cls.time})` : ''}</p>
                            {/* Mostrar quién creó la clase */}
                            {cls.createdBy && (
                              <p className="text-xs text-gray-400 mb-2 sm:mb-3">Creada por: <span className="font-mono">{cls.createdBy.substring(0, 8)}...</span></p>
                            )}
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => startEditing(cls)}
                                className="px-3 py-1.5 text-xs sm:text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => deleteClass(cls.id)}
                                className="px-3 py-1.5 text-xs sm:text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
                              >
                                Eliminar
                              </button>
                              <select
                                value={cls.status}
                                onChange={(e) => updateClassStatus(cls.id, e.target.value)}
                                className="px-3 py-1.5 text-xs sm:text-sm border border-gray-300 rounded-lg bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                              >
                                <option value="Planeada">Planeada</option>
                                <option value="En Progreso">En Progreso</option>
                                <option value="Completada">Completada</option>
                              </select>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default App;
