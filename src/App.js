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
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4 no-print">
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

const initialClassState = {
  title: '',
  purpose: '',
  activity_start: '',
  activity_main: '',
  activity_end: '',
  resources: '',
  date: '',
  time: '',
  dayOfWeek: '',
  status: 'Planeada',
  workshopType: '',
  objectives: []
};


// Main App Component
const App = () => {
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [classes, setClasses] = useState([]);
  const [workshops, setWorkshops] = useState([]);
  const [newWorkshopName, setNewWorkshopName] = useState('');
  const [selectedWorkshop, setSelectedWorkshop] = useState('');
  const [newClass, setNewClass] = useState(initialClassState);
  const [editingClass, setEditingClass] = useState(null);
  const [modalMessage, setModalMessage] = useState('');
  const [modalConfirmAction, setModalConfirmAction] = useState(null);
  const [showModalCancel, setShowModalCancel] = useState(false);
  const [newObjective, setNewObjective] = useState('');
  const [printingWeekId, setPrintingWeekId] = useState(null);
  const [expandedWeeks, setExpandedWeeks] = useState([]);

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
        if (fetchedWorkshops.length > 0 && !fetchedWorkshops.some(w => w.name === selectedWorkshop)) {
          setSelectedWorkshop(fetchedWorkshops[0].name);
        } else if (fetchedWorkshops.length === 0) {
          setSelectedWorkshop('');
        }
      }, (error) => {
        console.error("Error fetching workshops:", error);
        setModalMessage("Error al cargar los talleres. Intenta de nuevo.");
        setModalConfirmAction(() => () => setModalMessage(''));
      });
      return () => unsubscribe();
    }
  }, [isAuthReady, userId]);

  // Update newClass.workshopType when selectedWorkshop changes
  useEffect(() => {
    setNewClass(prev => ({ ...prev, workshopType: selectedWorkshop }));
  }, [selectedWorkshop]);


  // Fetch classes when auth is ready, userId is available, and selectedWorkshop changes
  useEffect(() => {
    if (isAuthReady && userId && selectedWorkshop) {
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
      setClasses([]);
    }
  }, [isAuthReady, userId, selectedWorkshop]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const currentState = editingClass ? editingClass : newClass;
    const stateSetter = editingClass ? setEditingClass : setNewClass;

    if (name === 'date') {
      const weekDays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      const selectedDate = new Date(`${value}T00:00:00`);
      const dayOfWeek = weekDays[selectedDate.getDay()];
      stateSetter({ ...currentState, date: value, dayOfWeek: dayOfWeek });
    } else {
      stateSetter({ ...currentState, [name]: value });
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

    const classData = editingClass || newClass;

    if (!classData.title.trim()) {
      setModalMessage("El título de la clase no puede estar vacío.");
      setModalConfirmAction(() => () => setModalMessage(''));
      return;
    }
    if (!classData.date.trim()) {
      setModalMessage("La fecha de la clase no puede estar vacía.");
      setModalConfirmAction(() => () => setModalMessage(''));
      return;
    }
    if (!classData.time.trim()) {
      setModalMessage("La hora de la clase no puede estar vacía.");
      setModalConfirmAction(() => () => setModalMessage(''));
      return;
    }
    if (classData.dayOfWeek === 'Domingo') {
      setModalMessage("No se pueden añadir clases en Domingo.");
      setModalConfirmAction(() => () => setModalMessage(''));
      return;
    }

    const dataToSave = {
      title: classData.title,
      purpose: classData.purpose || '',
      activity_start: classData.activity_start || '',
      activity_main: classData.activity_main || '',
      activity_end: classData.activity_end || '',
      resources: classData.resources || '',
      date: new Date(classData.date),
      time: classData.time,
      dayOfWeek: classData.dayOfWeek,
      status: classData.status,
      workshopType: classData.workshopType,
      objectives: classData.objectives || [],
    };

    try {
      const sharedClassesCollectionRef = collection(db, `artifacts/${APP_IDENTIFIER}/public/data/classes`);

      if (editingClass) {
        const classRef = doc(sharedClassesCollectionRef, editingClass.id);
        await updateDoc(classRef, { ...dataToSave });
        setEditingClass(null);
        setModalMessage("Clase actualizada con éxito.");
      } else {
        await addDoc(sharedClassesCollectionRef, {
          ...dataToSave,
          createdAt: new Date(),
          createdBy: userId,
        });
        setNewClass({ ...initialClassState, workshopType: selectedWorkshop });
        setModalMessage("Clase añadida con éxito.");
      }
      setModalConfirmAction(() => () => setModalMessage(''));

    } catch (e) {
      console.error("Error adding/updating document: ", e);
      setModalMessage("Error al guardar la clase. Intenta de nuevo.");
      setModalConfirmAction(() => () => setModalMessage(''));
    }
  };

  const startEditing = (classToEdit) => {
    setEditingClass({
      ...initialClassState,
      ...classToEdit,
      time: classToEdit.time || '',
      objectives: classToEdit.objectives || []
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEditing = () => {
    setEditingClass(null);
    setNewClass({ ...initialClassState, workshopType: selectedWorkshop });
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
        await deleteDoc(doc(sharedClassesCollectionRef, id));
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

  const handleAddObjective = () => {
    if (!newObjective.trim()) return;

    const newObjectiveItem = { text: newObjective.trim(), completed: false };

    if (editingClass) {
      setEditingClass(prev => ({ ...prev, objectives: [...prev.objectives, newObjectiveItem] }));
    } else {
      setNewClass(prev => ({ ...prev, objectives: [...prev.objectives, newObjectiveItem] }));
    }
    setNewObjective('');
  };

  const handleRemoveObjective = (indexToRemove) => {
    if (editingClass) {
      setEditingClass(prev => ({ ...prev, objectives: prev.objectives.filter((_, index) => index !== indexToRemove) }));
    } else {
      setNewClass(prev => ({ ...prev, objectives: prev.objectives.filter((_, index) => index !== indexToRemove) }));
    }
  };

  const handleToggleObjective = async (classId, objectiveIndex) => {
    if (!userId) return;

    const classToUpdate = classes.find(c => c.id === classId);
    if (!classToUpdate) return;

    const updatedObjectives = JSON.parse(JSON.stringify(classToUpdate.objectives));
    updatedObjectives[objectiveIndex].completed = !updatedObjectives[objectiveIndex].completed;

    try {
      const classRef = doc(db, `artifacts/${APP_IDENTIFIER}/public/data/classes`, classId);
      await updateDoc(classRef, { objectives: updatedObjectives });
    } catch (e) {
      console.error("Error toggling objective status: ", e);
      setModalMessage("Error al actualizar el objetivo. Intenta de nuevo.");
      setModalConfirmAction(() => () => setModalMessage(''));
    }
  };

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

  const getWeekIdentifier = (dateString) => {
    const date = new Date(`${dateString}T00:00:00`);

    const tempDate = new Date(date.valueOf());
    const dayNum = (date.getDay() + 6) % 7;
    tempDate.setDate(tempDate.getDate() - dayNum + 3);
    const firstThursday = tempDate.valueOf();
    tempDate.setMonth(0, 1);
    if (tempDate.getDay() !== 4) {
      tempDate.setMonth(0, 1 + ((4 - tempDate.getDay()) + 7) % 7);
    }
    const weekNo = 1 + Math.ceil((firstThursday - tempDate) / 604800000);

    const firstDayOfWeek = new Date(date);
    const dayOfWeek = date.getDay();
    firstDayOfWeek.setDate(date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));

    const lastDayOfWeek = new Date(firstDayOfWeek);
    lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 5);

    const formatOptions = { month: 'short', day: 'numeric' };
    const firstDayFormatted = firstDayOfWeek.toLocaleDateString('es-MX', formatOptions);
    const lastDayFormatted = lastDayOfWeek.toLocaleDateString('es-MX', { ...formatOptions, year: 'numeric' });

    return {
      id: firstDayOfWeek.toISOString().split('T')[0],
      label: `Semana ${weekNo} (del ${firstDayFormatted} al ${lastDayFormatted})`
    };
  };

  const getGroupedClasses = useCallback(() => {
    if (classes.length === 0) return [];

    const weekOrder = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    const grouped = classes.reduce((acc, cls) => {
      const week = getWeekIdentifier(cls.date);
      if (!acc[week.id]) {
        acc[week.id] = { label: week.label, days: {} };
      }
      if (!acc[week.id].days[cls.dayOfWeek]) {
        acc[week.id].days[cls.dayOfWeek] = [];
      }
      acc[week.id].days[cls.dayOfWeek].push(cls);
      return acc;
    }, {});

    Object.values(grouped).forEach(week => {
      week.sortedDays = Object.keys(week.days).sort((a, b) => weekOrder.indexOf(a) - weekOrder.indexOf(b));
    });

    return Object.entries(grouped)
      .sort(([weekIdA], [weekIdB]) => weekIdA.localeCompare(weekIdB))
      .map(([id, data]) => ({ id, ...data }));
  }, [classes]);
  
  const groupedClasses = getGroupedClasses();
  
  useEffect(() => {
    if (groupedClasses.length > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const dayOfWeek = today.getDay();
        const firstDayOfWeek = new Date(today);
        firstDayOfWeek.setDate(today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));

        const currentWeekId = firstDayOfWeek.toISOString().split('T')[0];
        
        const futureWeek = groupedClasses.find(week => week.id >= currentWeekId);
        
        if (futureWeek) {
            setExpandedWeeks([futureWeek.id]);
        } else if (groupedClasses.length > 0) {
            setExpandedWeeks([groupedClasses[groupedClasses.length - 1].id]);
        }
    } else {
        setExpandedWeeks([]);
    }
  }, [groupedClasses]);

  const handlePrintWeek = (weekId) => {
    setPrintingWeekId(weekId);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  useEffect(() => {
    const afterPrint = () => {
      setPrintingWeekId(null);
    };
    window.addEventListener('afterprint', afterPrint);
    return () => {
      window.removeEventListener('afterprint', afterPrint);
    };
  }, []);

  const getProgressMessage = (total, completed) => {
    if (total === 0) return "Añade clases para empezar.";
    if (completed === total) return "¡Felicidades! Semana completada.";
    if (completed > 0) return "¡Vas muy bien! Sigue así.";
    return "Aún hay trabajo por hacer. ¡Ánimo!";
  };

  const toggleWeek = (weekId) => {
    setExpandedWeeks(prev => {
        if (prev.includes(weekId)) {
            return prev.filter(id => id !== weekId);
        } else {
            // This makes it so only one week can be open at a time
            return [weekId];
        }
    });
  };

  const currentFormData = editingClass || newClass;
  
  const focusedWeekId = expandedWeeks.length > 0 ? expandedWeeks[0] : null;
  const classesForCharts = focusedWeekId
    ? classes.filter(c => getWeekIdentifier(c.date).id === focusedWeekId)
    : classes;
    
  const getChartData = (classList) => {
    const total = classList.length;
    const completed = classList.filter(c => c.status === 'Completada').length;
    const inProgress = classList.filter(c => c.status === 'En Progreso').length;
    const planned = classList.filter(c => c.status === 'Planeada').length;
    
    const percentage = total > 0 ? ((completed / total) * 100) : 0;

    const statusData = [
      { name: 'Completada', value: completed, color: '#4f46e5' },
      { name: 'En Progreso', value: inProgress, color: '#f59e0b' },
      { name: 'Planeada', value: planned, color: '#60a5fa' },
    ];

    const weekOrder = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dailyData = weekOrder.reduce((acc, day) => {
        acc[day] = { Planeada: 0, 'En Progreso': 0, Completada: 0 };
        return acc;
    }, {});

    classList.forEach(c => {
        if (dailyData[c.dayOfWeek]) {
            dailyData[c.dayOfWeek][c.status]++;
        }
    });

    const dailyChartData = Object.keys(dailyData).map(day => ({ day, ...dailyData[day] }));
    
    return { percentage, statusData, dailyChartData, total, completed };
  };
  
  const chartData = getChartData(classesForCharts);

  const PrintableWeek = ({ week, workshopName }) => (
    <div className="font-sans">
        <div className="p-4 bg-gray-100 border-b-2 border-black mb-5">
          <h1 className="text-2xl font-bold text-black">Plan de Clases: {workshopName}</h1>
          <h2 className="text-lg text-gray-700">{week.label}</h2>
        </div>
        <div className="px-4">
            {week.sortedDays.map(day => (
               <div key={day} className="mb-6" style={{ pageBreakInside: 'avoid' }}>
                  <h3 className="text-xl font-bold text-black border-b border-gray-400 pb-2 mb-4">{day}</h3>
                  <div className="space-y-4">
                    {week.days[day].map(cls => (
                      <div key={cls.id} className="border border-gray-300 p-4" style={{ pageBreakInside: 'avoid' }}>
                         <div className="border-b border-gray-200 pb-2 mb-2">
                           <h4 className="text-lg font-bold text-black">{cls.title}</h4>
                           <p className="text-sm text-gray-600">{cls.date} ({cls.time}) | {cls.status}</p>
                         </div>
                         <table className="w-full text-sm">
                          <tbody>
                            <tr className="border-b border-gray-200">
                              <td className="font-bold align-top py-2 pr-2 w-28">Propósito:</td>
                              <td className="py-2">{cls.purpose || '-'}</td>
                            </tr>
                            <tr className="border-b border-gray-200">
                              <td className="font-bold align-top py-2 pr-2">Inicio:</td>
                              <td className="py-2">{cls.activity_start || '-'}</td>
                            </tr>
                            <tr className="border-b border-gray-200">
                              <td className="font-bold align-top py-2 pr-2">Desarrollo:</td>
                              <td className="py-2">{cls.activity_main || '-'}</td>
                            </tr>
                            <tr className="border-b border-gray-200">
                              <td className="font-bold align-top py-2 pr-2">Cierre:</td>
                              <td className="py-2">{cls.activity_end || '-'}</td>
                            </tr>
                              <tr>
                              <td className="font-bold align-top py-2 pr-2">Recursos:</td>
                              <td className="py-2">{cls.resources || '-'}</td>
                            </tr>
                          </tbody>
                         </table>
                         {cls.objectives && cls.objectives.length > 0 && (
                           <div className="mt-3 pt-3 border-t border-gray-200">
                             <strong className="text-base">Checklist de Tareas</strong>
                             <ul className="list-none p-0 mt-1">
                               {cls.objectives.map((obj, index) => (
                                 <li key={index} className="text-sm">
                                   <span className="inline-block mr-2 text-lg">{obj.completed ? '☑' : '☐'}</span> {obj.text}
                                 </li>
                               ))}
                             </ul>
                           </div>
                         )}
                      </div>
                    ))}
                  </div>
               </div>
            ))}
        </div>
    </div>
  );

  if (printingWeekId) {
    const weekToPrint = groupedClasses.find(w => w.id === printingWeekId);
    return weekToPrint ? <PrintableWeek week={weekToPrint} workshopName={selectedWorkshop} /> : null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-100 p-4 sm:p-6 font-sans text-gray-800 max-w-full overflow-x-hidden relative z-0 print:hidden">
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
        <p className="text-base sm:text-lg text-gray-600">Organiza y sigue el progreso de tus talleres.</p>
        {userId && (
          <p className="text-xs sm:text-sm text-gray-500 mt-2">
            ID de Sesión Anónima (compartido para identificar tus aportaciones): <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded-md text-xs">{userId}</span>
          </p>
        )}
        {!isAuthReady && (
          <p className="text-sm text-blue-500 mt-2 animate-pulse">Conectando con la base de datos...</p>
        )}
      </header>

      <main className="flex flex-col lg:grid lg:grid-cols-3 gap-6 sm:gap-8 relative z-0">
        <section className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 h-fit lg:col-span-1 lg:sticky lg:top-4 w-full order-first relative z-20">
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
                  value={currentFormData.workshopType}
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
                  value={currentFormData.workshopType}
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
                value={currentFormData.title}
                onChange={handleInputChange}
                placeholder="Introducir título"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base transition duration-150 ease-in-out"
              />
            </div>

            <div className='border border-gray-200 rounded-lg p-3 space-y-3 bg-gray-50'>
              <h3 className='text-lg font-semibold text-gray-700'>Guía Pedagógica</h3>
              <div>
                <label htmlFor="purpose" className="block text-sm font-medium text-gray-700 mb-1">Propósito de la Clase</label>
                <input
                  type="text"
                  id="purpose"
                  name="purpose"
                  value={currentFormData.purpose}
                  onChange={handleInputChange}
                  placeholder="¿Qué competencia se desarrollará?"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
              <div>
                <label htmlFor="activity_start" className="block text-sm font-medium text-gray-700 mb-1">Inicio (Actividad de Apertura)</label>
                <textarea
                  id="activity_start"
                  name="activity_start"
                  value={currentFormData.activity_start}
                  onChange={handleInputChange}
                  rows="2"
                  placeholder="¿Cómo iniciará la sesión?"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
                ></textarea>
              </div>
              <div>
                <label htmlFor="activity_main" className="block text-sm font-medium text-gray-700 mb-1">Desarrollo (Actividades Principales)</label>
                <textarea
                  id="activity_main"
                  name="activity_main"
                  value={currentFormData.activity_main}
                  onChange={handleInputChange}
                  rows="4"
                  placeholder="Detallar actividades centrales..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
                ></textarea>
              </div>
              <div>
                <label htmlFor="activity_end" className="block text-sm font-medium text-gray-700 mb-1">Cierre (Actividad de Conclusión)</label>
                <textarea
                  id="activity_end"
                  name="activity_end"
                  value={currentFormData.activity_end}
                  onChange={handleInputChange}
                  rows="2"
                  placeholder="¿Cómo concluirá la sesión?"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
                ></textarea>
              </div>
              <div>
                <label htmlFor="resources" className="block text-sm font-medium text-gray-700 mb-1">Recursos y Materiales</label>
                <textarea
                  id="resources"
                  name="resources"
                  value={currentFormData.resources}
                  onChange={handleInputChange}
                  rows="2"
                  placeholder="Listar materiales necesarios..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
                ></textarea>
              </div>
            </div>

            <div>
              <label htmlFor="objective" className="block text-sm font-medium text-gray-700 mb-1">Objetivos Marcables (Checklist de Tareas)</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  id="objective"
                  value={newObjective}
                  onChange={(e) => setNewObjective(e.target.value)}
                  placeholder="Escribe una tarea específica y añádela"
                  className="flex-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
                <button
                  type="button"
                  onClick={handleAddObjective}
                  className="px-4 py-2 bg-indigo-500 text-white font-semibold rounded-lg hover:bg-indigo-600 transition-colors"
                >
                  Añadir
                </button>
              </div>
              <ul className="space-y-2 max-h-32 overflow-y-auto pr-2">
                {currentFormData.objectives.map((obj, index) => (
                  <li key={index} className="flex items-center justify-between bg-gray-100 p-2 rounded-md">
                    <span className="text-sm text-gray-800">{obj.text}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveObjective(index)}
                      className="text-red-500 hover:text-red-700 font-bold text-lg"
                      aria-label="Eliminar objetivo"
                    >
                      &times;
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                <input
                  type="date"
                  id="date"
                  name="date"
                  value={currentFormData.date}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base transition duration-150 ease-in-out"
                />
              </div>
              <div>
                <label htmlFor="time" className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
                <input
                  type="time"
                  id="time"
                  name="time"
                  value={currentFormData.time}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm sm:text-base transition duration-150 ease-in-out"
                />
              </div>
            </div>

            <div>
              <label htmlFor="dayOfWeek" className="block text-sm font-medium text-gray-700 mb-1">Día de la Semana</label>
              <input
                type="text"
                id="dayOfWeek"
                name="dayOfWeek"
                value={currentFormData.dayOfWeek}
                readOnly
                placeholder="Se calculará con la fecha"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed text-sm sm:text-base"
              />
            </div>
            {editingClass && (
              <div>
                <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                <select
                  id="status"
                  name="status"
                  value={currentFormData.status}
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

        <section className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 space-y-6 sm:space-y-8 lg:col-span-2 w-full order-2 lg:order-2">
          <div className="flex flex-wrap justify-center gap-2 sm:gap-4">
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

          <div className="space-y-4 sm:space-y-6">
            <h2 className="text-xl sm:text-2xl font-bold text-blue-600 mb-3 sm:mb-4 border-b pb-2 sm:pb-3">
              {focusedWeekId ? "Avance de la Semana" : "Avance General"} ({selectedWorkshop || 'Ningún Taller Seleccionado'})
            </h2>
            <div className="text-center mb-3 sm:mb-4">
              <p className="text-2xl sm:text-3xl font-extrabold text-green-600">{`${chartData.percentage.toFixed(1)}%`}% Completado</p>
              <p className="text-base sm:text-lg text-gray-700 mt-1 sm:mt-2">{getProgressMessage(chartData.total, chartData.completed)}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                {classesForCharts.length > 0 ? (
                    <>
                        <div className="bg-gray-50 p-3 sm:p-4 rounded-lg shadow-inner h-64 sm:h-72">
                            <h3 className="text-lg sm:text-xl font-semibold text-gray-700 mb-2">Estado de Clases</h3>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={chartData.statusData} cx="50%" cy="45%" innerRadius={60} outerRadius={80} fill="#8884d8" paddingAngle={5} dataKey="value">
                                        {chartData.statusData.map((entry, index) => ( <Cell key={`cell-${index}`} fill={entry.color} /> ))}
                                    </Pie>
                                    <Tooltip />
                                    <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle" className="text-3xl font-bold fill-gray-800">
                                        {`${chartData.percentage.toFixed(0)}%`}
                                    </text>
                                    <text x="50%" y="45%" dy={20} textAnchor="middle" className="fill-gray-500 text-sm">Completado</text>
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="bg-gray-50 p-3 sm:p-4 rounded-lg shadow-inner h-64 sm:h-72">
                            <h3 className="text-lg sm:text-xl font-semibold text-gray-700 mb-2">Clases por Día</h3>
                            <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData.dailyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="day" fontSize={12} />
                                <YAxis fontSize={12} allowDecimals={false} />
                                <Tooltip />
                                <Legend wrapperStyle={{ fontSize: '12px' }} />
                                <Bar dataKey="Planeada" stackId="a" fill="#60a5fa" />
                                <Bar dataKey="En Progreso" stackId="a" fill="#f59e0b" />
                                <Bar dataKey="Completada" stackId="a" fill="#4f46e5" />
                            </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </>
                ) : (
                    <div className="md:col-span-2 bg-gray-50 p-6 rounded-lg shadow-inner h-64 sm:h-72 flex flex-col items-center justify-center text-center">
                         <h3 className="text-lg sm:text-xl font-semibold text-gray-700">No hay clases en esta vista</h3>
                         <p className="text-gray-500 mt-2">Añade una clase para ver las estadísticas aquí.</p>
                    </div>
                )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6">
            <h2 className="text-xl sm:text-2xl font-bold text-blue-600 mb-3 sm:mb-4 border-b pb-2 sm:pb-3">Mis Clases de {selectedWorkshop || 'Ningún Taller Seleccionado'}</h2>
            {classes.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <p className="text-lg mb-4">¡Empecemos a planificar!</p>
                <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition duration-200">✨ Planificar mi primera clase</button>
              </div>
            ) : (
              <div className="space-y-6">
                {groupedClasses.map(week => (
                  <div key={week.id}>
                    <div onClick={() => toggleWeek(week.id)} className={`flex justify-between items-center mb-4 p-3 rounded-lg shadow-sm cursor-pointer transition-colors ${focusedWeekId === week.id ? 'bg-indigo-100' : 'bg-purple-50 hover:bg-purple-100'}`}>
                      <h3 className={`text-xl font-bold ${focusedWeekId === week.id ? 'text-indigo-800' : 'text-purple-600'}`}>{week.label}</h3>
                      <div className="flex items-center">
                        <span className={`mr-4 text-purple-600 transition-transform duration-300 ${expandedWeeks.includes(week.id) ? 'rotate-180' : 'rotate-0'}`}>▼</span>
                        <button onClick={(e) => { e.stopPropagation(); handlePrintWeek(week.id); }} title="Imprimir o Guardar Semana como PDF" className="p-2 hover:bg-purple-200 rounded-full transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    {expandedWeeks.includes(week.id) && (
                        <div className="space-y-4 sm:space-y-6 ml-2 sm:ml-4 pl-4 border-l-2 border-purple-200">
                        {week.sortedDays.map(day => (
                            <div key={day}>
                                <h4 className="text-lg sm:text-xl font-bold text-blue-500 mb-3 border-b-2 border-blue-200 pb-1.5">{day}</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                                {week.days[day].map(cls => (
                                    <div key={cls.id} className={`bg-gray-50 p-4 sm:p-5 rounded-lg shadow-sm border ${
                                    cls.status === 'Completada' ? 'border-green-400' :
                                    cls.status === 'En Progreso' ? 'border-yellow-400' :
                                    'border-blue-300'
                                    }`}>
                                    <div className="flex justify-between items-start mb-1.5 sm:mb-2">
                                        <h5 className="text-base sm:text-lg font-semibold text-gray-900">{cls.title}</h5>
                                        <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                                        cls.status === 'Completada' ? 'bg-green-100 text-green-800' :
                                        cls.status === 'En Progreso' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-blue-100 text-blue-800'
                                        }`}>
                                        {cls.status}
                                        </span>
                                    </div>
                                    
                                    <div className='text-xs sm:text-sm text-gray-500 mb-3'>
                                        <span className='font-bold'>{cls.date}</span> {cls.time ? `(${cls.time})` : ''}
                                    </div>
                                    
                                    {cls.purpose || cls.activity_start || cls.activity_main || cls.activity_end || cls.resources ? (
                                        <div className="space-y-2 text-sm mb-3">
                                        {cls.purpose && <div><strong className='text-gray-700'>Propósito:</strong> <span className='text-gray-600'>{cls.purpose}</span></div>}
                                        {cls.activity_start && <div><strong className='text-gray-700'>Inicio:</strong> <span className='text-gray-600'>{cls.activity_start}</span></div>}
                                        {cls.activity_main && <div><strong className='text-gray-700'>Desarrollo:</strong> <span className='text-gray-600'>{cls.activity_main}</span></div>}
                                        {cls.activity_end && <div><strong className='text-gray-700'>Cierre:</strong> <span className='text-gray-600'>{cls.activity_end}</span></div>}
                                        {cls.resources && <div><strong className='text-gray-700'>Recursos:</strong> <span className='text-gray-600'>{cls.resources}</span></div>}
                                        </div>
                                    ) : (
                                        cls.description && <p className="text-sm text-gray-600 mb-2">{cls.description}</p>
                                    )}

                                    {cls.createdBy && (
                                        <p className="text-xs text-gray-400 mb-3">Creada por: <span className="font-mono">{cls.createdBy.substring(0, 8)}...</span></p>
                                    )}
                                    
                                    {cls.objectives && cls.objectives.length > 0 && (
                                        <div className="border-t pt-3">
                                        <h5 className="text-sm font-semibold text-gray-700 mb-2">Checklist de Tareas:</h5>
                                        <ul className="space-y-1.5">
                                            {cls.objectives.map((obj, index) => (
                                            <li key={index} className="flex items-center">
                                                <input
                                                type="checkbox"
                                                id={`obj-${cls.id}-${index}`}
                                                checked={obj.completed}
                                                onChange={() => handleToggleObjective(cls.id, index)}
                                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                />
                                                <label
                                                htmlFor={`obj-${cls.id}-${index}`}
                                                className={`ml-2 text-sm text-gray-600 cursor-pointer ${obj.completed ? 'line-through text-gray-400' : ''}`}
                                                >
                                                {obj.text}
                                                </label>
                                            </li>
                                            ))}
                                        </ul>
                                        </div>
                                    )}

                                    <div className="flex flex-wrap gap-2 mt-4 border-t pt-3 no-print">
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

        <section className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 h-fit w-full order-last lg:order-3">
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
      </main>
    </div>
  );
};

export default App;
