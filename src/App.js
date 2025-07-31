import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, Text } from 'recharts';

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
            className="px-5 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50"
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
  const [activeTab, setActiveTab] = useState('addClass');

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
    setActiveTab('addClass');
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

  const getProgressData = useCallback(() => {
    const totalClasses = classes.length;
    const completedClasses = classes.filter(c => c.status === 'Completada').length;
    
    const progressPercentage = totalClasses > 0 ? ((completedClasses / totalClasses) * 100) : 0;

    const overallStatusData = [
      { name: 'Completadas', value: completedClasses, color: '#4f46e5' },
      { name: 'En Progreso', value: classes.filter(c => c.status === 'En Progreso').length, color: '#f59e0b' },
      { name: 'Planeadas', value: classes.filter(c => c.status === 'Planeada').length, color: '#60a5fa' },
    ];

    const weekOrder = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dailyData = weekOrder.reduce((acc, day) => {
        acc[day] = { Planeada: 0, 'En Progreso': 0, Completada: 0 };
        return acc;
    }, {});

    classes.forEach(c => {
        if (dailyData[c.dayOfWeek]) {
            dailyData[c.dayOfWeek][c.status]++;
        }
    });

    const dailyProgressData = Object.keys(dailyData).map(day => ({
        day: day,
        ...dailyData[day]
    }));

    return { overallStatusData, dailyProgressData, progressPercentage };
  }, [classes]);
  
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

  const getGroupedClasses = () => {
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
  };

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


  const { overallStatusData, dailyProgressData, progressPercentage } = getProgressData();
  const groupedClasses = getGroupedClasses();
  const currentFormData = editingClass || newClass;
  
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
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800 print:hidden">
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
      
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Planificador de Clases</h1>
          <p className="text-gray-500 mt-1">Panel de control para tus talleres de {selectedWorkshop || "..."}</p>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <section className="lg:col-span-2 space-y-8">
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-500 mb-3">SELECCIONA UN TALLER</h2>
              <div className="flex flex-wrap gap-2">
                {workshops.length === 0 ? (
                  <p className="text-gray-500">Añade talleres en el panel de la derecha.</p>
                ) : (
                  workshops.map(workshop => (
                    <button
                      key={workshop.id}
                      onClick={() => setSelectedWorkshop(workshop.name)}
                      className={`px-4 py-2 rounded-md font-semibold text-sm transition-all duration-200 ${
                        selectedWorkshop === workshop.name
                          ? 'bg-indigo-600 text-white shadow'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {workshop.name}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Estado General</h3>
                  <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                          <Pie
                              data={overallStatusData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              fill="#8884d8"
                              paddingAngle={5}
                              dataKey="value"
                          >
                              {overallStatusData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                          </Pie>
                          <Tooltip />
                           <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-3xl font-bold fill-gray-800">
                              {progressPercentage.toFixed(0)}%
                          </text>
                           <text x="50%" y="50%" dy={20} textAnchor="middle" className="fill-gray-500 text-sm">
                              Completado
                          </text>
                      </PieChart>
                  </ResponsiveContainer>
              </div>
              <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Clases por Día</h3>
                  <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={dailyProgressData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="day" fontSize={12} tickLine={false} axisLine={false} />
                          <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                          <Tooltip cursor={{fill: 'rgba(239, 246, 255, 0.5)'}} />
                          <Legend wrapperStyle={{fontSize: '12px', paddingTop: '10px'}} />
                          <Bar dataKey="Planeada" stackId="a" fill="#60a5fa" radius={[0, 0, 4, 4]} />
                          <Bar dataKey="En Progreso" stackId="a" fill="#f59e0b" radius={[0, 0, 4, 4]} />
                          <Bar dataKey="Completada" stackId="a" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                      </BarChart>
                  </ResponsiveContainer>
              </div>
            </div>

            <div className="space-y-8">
              {groupedClasses.map(week => (
                <div key={week.id}>
                  <div className="flex justify-between items-center mb-4 p-3">
                    <h3 className="text-xl font-bold text-gray-800">{week.label}</h3>
                    <button onClick={() => handlePrintWeek(week.id)} title="Imprimir o Guardar Semana como PDF" className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                      </svg>
                    </button>
                  </div>
                  <div className="space-y-6">
                    {week.sortedDays.map(day => (
                       <div key={day}>
                          <h4 className="text-base font-semibold text-gray-500 uppercase tracking-wider mb-3">{day}</h4>
                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                            {week.days[day].map(cls => (
                              <div key={cls.id} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm transition-all hover:shadow-md">
                                <div className="flex justify-between items-start mb-2">
                                  <h5 className="text-base font-bold text-gray-800">{cls.title}</h5>
                                  <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                                    cls.status === 'Completada' ? 'bg-indigo-100 text-indigo-800' :
                                    cls.status === 'En Progreso' ? 'bg-amber-100 text-amber-800' :
                                    'bg-blue-100 text-blue-800'
                                  }`}>
                                    {cls.status}
                                  </span>
                                </div>
                                <p className='text-xs text-gray-500 mb-3'>{cls.date} {cls.time ? `(${cls.time})` : ''}</p>
                                
                                {cls.purpose && <p className="text-sm text-gray-600 mb-2 line-clamp-2"><strong className="font-semibold">Propósito:</strong> {cls.purpose}</p>}

                                {cls.objectives && cls.objectives.length > 0 && (
                                  <div className="mt-3 pt-3 border-t border-gray-100">
                                    <h5 className="text-xs font-semibold text-gray-500 mb-2">CHECKLIST</h5>
                                    <ul className="space-y-1.5">
                                      {cls.objectives.slice(0, 3).map((obj, index) => (
                                        <li key={index} className="flex items-center text-sm">
                                          <input
                                            type="checkbox"
                                            id={`obj-small-${cls.id}-${index}`}
                                            checked={obj.completed}
                                            onChange={() => handleToggleObjective(cls.id, index)}
                                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                          />
                                          <label htmlFor={`obj-small-${cls.id}-${index}`} className={`ml-2 text-gray-600 ${obj.completed ? 'line-through text-gray-400' : ''}`}>{obj.text}</label>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-gray-100">
                                  <button onClick={() => startEditing(cls)} className="px-3 py-1 text-xs bg-gray-100 text-gray-700 font-semibold rounded-md hover:bg-gray-200 transition-colors">Editar</button>
                                  <button onClick={() => deleteClass(cls.id)} className="px-3 py-1 text-xs bg-red-50 text-red-700 font-semibold rounded-md hover:bg-red-100 transition-colors">Eliminar</button>
                                </div>
                              </div>
                            ))}
                          </div>
                       </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <aside className="lg:col-span-1">
            <div className="sticky top-8 bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="border-b border-gray-200">
                <nav className="flex -mb-px" aria-label="Tabs">
                  <button onClick={() => setActiveTab('addClass')} className={`w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm ${activeTab === 'addClass' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                    {editingClass ? 'Editar Clase' : 'Añadir Clase'}
                  </button>
                  <button onClick={() => setActiveTab('manage')} className={`w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm ${activeTab === 'manage' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                    Gestión
                  </button>
                </nav>
              </div>
              
              <div className={`p-6 ${activeTab === 'addClass' ? 'block' : 'hidden'}`}>
                <h2 className="text-xl font-bold text-gray-800 mb-4">{editingClass ? 'Editar Detalles de la Clase' : `Añadir a ${selectedWorkshop || '...'}`}</h2>
                <div className="space-y-4">
                    {/* Simplified Add Form */}
                    <div>
                        <label htmlFor="title" className="block text-sm font-medium text-gray-700">Título de la Clase</label>
                        <input type="text" id="title" name="title" value={currentFormData.title} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"/>
                    </div>
                    <div>
                        <label htmlFor="date" className="block text-sm font-medium text-gray-700">Fecha y Hora</label>
                        <div className="flex gap-2 mt-1">
                            <input type="date" id="date" name="date" value={currentFormData.date} onChange={handleInputChange} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"/>
                            <input type="time" id="time" name="time" value={currentFormData.time} onChange={handleInputChange} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"/>
                        </div>
                    </div>
                    
                    {/* Full Edit Form */}
                    {editingClass && (
                      <>
                        <div className='border-t border-gray-200 pt-4 space-y-4'>
                          <h3 className='text-lg font-semibold text-gray-700'>Guía Pedagógica</h3>
                          {/* All the pedagogical fields */}
                          <div>
                            <label htmlFor="purpose" className="block text-sm font-medium text-gray-700">Propósito</label>
                            <input type="text" name="purpose" value={currentFormData.purpose} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"/>
                          </div>
                           <div>
                            <label htmlFor="activity_start" className="block text-sm font-medium text-gray-700">Inicio</label>
                            <textarea name="activity_start" value={currentFormData.activity_start} onChange={handleInputChange} rows="2" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"></textarea>
                          </div>
                          <div>
                            <label htmlFor="activity_main" className="block text-sm font-medium text-gray-700">Desarrollo</label>
                            <textarea name="activity_main" value={currentFormData.activity_main} onChange={handleInputChange} rows="3" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"></textarea>
                          </div>
                          <div>
                            <label htmlFor="activity_end" className="block text-sm font-medium text-gray-700">Cierre</label>
                            <textarea name="activity_end" value={currentFormData.activity_end} onChange={handleInputChange} rows="2" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"></textarea>
                          </div>
                          <div>
                            <label htmlFor="resources" className="block text-sm font-medium text-gray-700">Recursos</label>
                            <textarea name="resources" value={currentFormData.resources} onChange={handleInputChange} rows="2" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"></textarea>
                          </div>
                        </div>
                        <div className="border-t border-gray-200 pt-4">
                          <label className="block text-sm font-medium text-gray-700">Checklist de Tareas</label>
                          <div className="flex gap-2 mt-1">
                            <input type="text" value={newObjective} onChange={(e) => setNewObjective(e.target.value)} placeholder="Nueva tarea" className="flex-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"/>
                            <button onClick={handleAddObjective} className="bg-gray-200 text-gray-700 font-semibold py-2 px-3 rounded-lg hover:bg-gray-300 text-sm">Añadir</button>
                          </div>
                          <ul className="space-y-2 mt-2 max-h-32 overflow-y-auto">
                            {currentFormData.objectives.map((obj, index) => (
                              <li key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded-md">
                                <span className="text-sm text-gray-800">{obj.text}</span>
                                <button onClick={() => handleRemoveObjective(index)} className="text-red-500 hover:text-red-700 font-bold text-sm">&times;</button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </>
                    )}

                    <div className="flex-1 bg-indigo-600 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-indigo-700 transition duration-200 ease-in-out shadow-sm text-center cursor-pointer" onClick={addOrUpdateClass}>
                      {editingClass ? 'Guardar Cambios' : 'Añadir Clase'}
                    </div>
                    {editingClass && (
                      <div className="flex-1 bg-gray-200 text-gray-800 font-bold py-2.5 px-4 rounded-lg hover:bg-gray-300 transition duration-200 ease-in-out shadow-sm text-center cursor-pointer" onClick={cancelEditing}>
                        Cancelar Edición
                      </div>
                    )}
                </div>
              </div>
              
              <div className={`p-6 ${activeTab === 'manage' ? 'block' : 'hidden'}`}>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3">Añadir Nuevo Taller</h3>
                    <div className="flex gap-2">
                      <input type="text" value={newWorkshopName} onChange={(e) => setNewWorkshopName(e.target.value)} placeholder="Ej. Taller de Música" className="flex-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"/>
                      <button onClick={addWorkshop} className="bg-indigo-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">Añadir</button>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3">Talleres Existentes</h3>
                    {workshops.length === 0 ? (
                      <p className="text-gray-500 text-sm">No hay talleres añadidos aún.</p>
                    ) : (
                      <ul className="space-y-2">
                        {workshops.map(workshop => (
                          <li key={workshop.id} className="flex justify-between items-center bg-gray-50 p-2 rounded-md">
                            <span className="text-sm text-gray-800">{workshop.name}</span>
                            <button onClick={() => deleteWorkshop(workshop.id, workshop.name)} className="text-red-500 hover:text-red-700 font-bold text-sm">&times;</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </aside>
        </main>
      </div>
    </div>
  );
};

export default App;
