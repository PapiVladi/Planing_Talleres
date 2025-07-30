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

  const getProgressData = useCallback(() => {
    const totalClasses = classes.length;
    const completedClasses = classes.filter(c => c.status === 'Completada').length;
    const inProgressClasses = classes.filter(c => c.status === 'En Progreso').length;
    const plannedClasses = classes.filter(c => c.status === 'Planeada').length;

    const overallStatusData = [
      { name: 'Completadas', value: completedClasses, color: '#4CAF50' },
      { name: 'En Progreso', value: inProgressClasses, color: '#FFC107' },
      { name: 'Planeadas', value: plannedClasses, color: '#2196F3' },
    ];

    const weekOrder = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const progressByDay = {};

    classes.forEach(c => {
      if (!progressByDay[c.dayOfWeek]) {
        progressByDay[c.dayOfWeek] = { 'Clases Planeadas': 0, 'Clases Completadas': 0 };
      }
      progressByDay[c.dayOfWeek]['Clases Planeadas']++;
      if (c.status === 'Completada') {
        progressByDay[c.dayOfWeek]['Clases Completadas']++;
      }
    });

    const dailyProgressData = Object.keys(progressByDay)
      .map(day => ({
        day: day,
        'Clases Planeadas': progressByDay[day]['Clases Planeadas'],
        'Clases Completadas': progressByDay[day]['Clases Completadas'],
      }))
      .sort((a, b) => weekOrder.indexOf(a.day) - weekOrder.indexOf(b.day));

    return { overallStatusData, dailyProgressData, totalClasses, completedClasses };
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


  const { overallStatusData, dailyProgressData, totalClasses, completedClasses } = getProgressData();
  const progressPercentage = totalClasses > 0 ? ((completedClasses / totalClasses) * 100).toFixed(1) : 0;
  const groupedClasses = getGroupedClasses();

  const getProgressMessage = () => {
    if (totalClasses === 0) return "¡Empieza a añadir tus clases para ver el progreso!";
    if (completedClasses === totalClasses) return "¡Felicidades! ¡Todas tus clases están completadas!";
    if (completedClasses > 0 && completedClasses < totalClasses) return "¡Vas muy bien! Sigue así.";
    return "Aún hay trabajo por hacer. ¡Ánimo!";
  };

  const currentFormData = editingClass || newClass;
  
  const PrintableWeek = ({ week, workshopName }) => {
    return (
      <div className="print-section">
          <header className="print-header">
            <h1>Plan de Clases: {workshopName}</h1>
            <h2>{week.label}</h2>
          </header>
          <div className="space-y-6">
              {week.sortedDays.map(day => (
                 <div key={day} className="day-container">
                    <h3 className="day-title">{day}</h3>
                    <div className="classes-container">
                      {week.days[day].map(cls => (
                        <div key={cls.id} className="class-card-printable">
                           <div className="class-header-printable">
                             <h4 className="class-title-printable">{cls.title}</h4>
                             <span className="class-status-printable">{cls.status}</span>
                           </div>
                           <p className='class-meta-printable'>{cls.date} ({cls.time})</p>
                           
                           <table className="pedagogy-table">
                            <tbody>
                              <tr>
                                <td>
                                  <strong>Propósito:</strong>
                                  <p>{cls.purpose || 'N/A'}</p>
                                </td>
                                <td>
                                  <strong>Inicio:</strong>
                                  <p>{cls.activity_start || 'N/A'}</p>
                                </td>
                              </tr>
                               <tr>
                                <td>
                                  <strong>Recursos:</strong>
                                  <p>{cls.resources || 'N/A'}</p>
                                </td>
                                <td>
                                  <strong>Desarrollo:</strong>
                                  <p>{cls.activity_main || 'N/A'}</p>
                                </td>
                              </tr>
                               <tr>
                                <td colSpan="2">
                                  <strong>Cierre:</strong>
                                  <p>{cls.activity_end || 'N/A'}</p>
                                </td>
                              </tr>
                            </tbody>
                           </table>

                           {cls.objectives && cls.objectives.length > 0 && (
                             <div className="checklist-section">
                               <strong>Checklist de Tareas</strong>
                               <ul>
                                 {cls.objectives.map((obj, index) => (
                                   <li key={index}>
                                     <span className="checkbox">{obj.completed ? '☑' : '☐'}</span> {obj.text}
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
  };
  
  const PrintStyles = () => (
    <style>{`
      @media print {
        @page {
          size: A4;
          margin: 20mm;
        }
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        body * {
          visibility: hidden;
          font-family: Arial, sans-serif;
        }
        .print-section, .print-section * {
          visibility: visible;
        }
        .print-section {
          position: absolute;
          left: 0;
          top: 0;
          right: 0;
          width: 100%;
        }
        .print-header {
          background-color: #f2f2f2 !important;
          padding: 12px;
          border-bottom: 2px solid #333;
          margin-bottom: 20px;
        }
        .print-header h1 {
          font-size: 18pt;
          margin: 0;
        }
        .print-header h2 {
          font-size: 14pt;
          margin: 0;
          font-weight: normal;
        }
        .day-container {
          page-break-inside: avoid;
        }
        .day-title {
          font-size: 16pt;
          border-bottom: 1px solid #ccc;
          padding-bottom: 5px;
          margin-bottom: 10px;
        }
        .class-card-printable {
          border: 1px solid #ccc;
          border-radius: 5px;
          padding: 12px;
          margin-bottom: 15px;
          page-break-inside: avoid;
        }
        .class-header-printable {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .class-title-printable {
          font-size: 14pt;
          font-weight: bold;
          margin: 0;
        }
        .class-status-printable {
          font-size: 10pt;
          background-color: #eee !important;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .class-meta-printable {
          font-size: 10pt;
          color: #555;
          margin: 4px 0 12px 0;
        }
        .pedagogy-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 12px;
          font-size: 11pt;
        }
        .pedagogy-table td {
          border: 1px solid #ddd;
          padding: 8px;
          vertical-align: top;
          width: 50%;
        }
        .pedagogy-table td p {
          margin: 2px 0 0 0;
        }
        .checklist-section {
          margin-top: 12px;
          border-top: 1px solid #eee;
          padding-top: 8px;
          font-size: 11pt;
        }
        .checklist-section ul {
          list-style: none;
          padding-left: 0;
          margin: 4px 0 0 0;
        }
        .checklist-section li {
          margin-bottom: 2px;
        }
        .checkbox {
          font-size: 14pt;
          line-height: 1;
        }
        .no-print {
          display: none !important;
        }
      }
    `}</style>
  );
  
  if (printingWeekId) {
    const weekToPrint = groupedClasses.find(w => w.id === printingWeekId);
    return weekToPrint ? <PrintableWeek week={weekToPrint} workshopName={selectedWorkshop} /> : null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-100 p-4 sm:p-6 font-sans text-gray-800 max-w-full overflow-x-hidden relative z-0">
      <PrintStyles />
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

      <header className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 mb-6 sm:mb-8 text-center relative z-10 no-print">
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

      <main className="flex flex-col lg:grid lg:grid-cols-3 gap-6 sm:gap-8 relative z-0 no-print">
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
            <h2 className="text-xl sm:text-2xl font-bold text-blue-600 mb-3 sm:mb-4 border-b pb-2 sm:pb-3">Avance General ({selectedWorkshop || 'Ningún Taller Seleccionado'})</h2>
            <div className="text-center mb-3 sm:mb-4">
              <p className="text-2xl sm:text-3xl font-extrabold text-green-600">{progressPercentage}% Completado</p>
              <p className="text-base sm:text-lg text-gray-700 mt-1 sm:mt-2">{getProgressMessage()}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
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

              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg shadow-inner h-64 sm:h-72 overflow-hidden flex-none min-w-0 relative z-0">
                <h3 className="text-lg sm:text-xl font-semibold text-gray-700 mb-2 sm:mb-3">Clases por Día</h3>
                <ResponsiveContainer width="100%" height="100%" key={selectedWorkshop + 'bar'}>
                  <BarChart
                    data={dailyProgressData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" fontSize={12} />
                    <YAxis fontSize={12} allowDecimals={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="Clases Planeadas" fill="#2196F3" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="Clases Completadas" fill="#4CAF50" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-4 sm:p-6">
            <h2 className="text-xl sm:text-2xl font-bold text-blue-600 mb-3 sm:mb-4 border-b pb-2 sm:pb-3">Mis Clases de {selectedWorkshop || 'Ningún Taller Seleccionado'}</h2>
            {classes.length === 0 ? (
              <p className="text-center text-gray-500 py-6 sm:py-8 text-base sm:text-lg">No hay clases planificadas para {selectedWorkshop} aún. ¡Añade una arriba!</p>
            ) : (
              <div className="space-y-6">
                {groupedClasses.map(week => (
                  <div key={week.id}>
                    <div className="flex justify-between items-center mb-4 bg-purple-50 p-3 rounded-lg shadow-sm">
                      <h3 className="text-xl font-bold text-purple-600">{week.label}</h3>
                      <button onClick={() => handlePrintWeek(week.id)} title="Imprimir o Guardar Semana como PDF" className="p-2 hover:bg-purple-200 rounded-full transition-colors no-print">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                      </button>
                    </div>
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
