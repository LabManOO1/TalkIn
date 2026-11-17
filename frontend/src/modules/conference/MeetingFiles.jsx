import { useCallback, useEffect, useState } from "react";
import apiClient from "../../api/client";
import styles from "./MeetingFiles.module.scss";

const getErrorMessage = (error, fallback) => {
  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return detail;
  return error.response ? fallback : "Нет соединения с файловым сервисом";
};

function MeetingFiles({ inviteCode, active, onClose }) {
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const loadFiles = useCallback(async () => {
    if (!inviteCode) return;
    setLoading(true);
    try {
      const response = await apiClient.listMeetingFiles(inviteCode);
      setFiles(Array.isArray(response.data) ? response.data : []);
      setStatus("");
    } catch (error) {
      setStatus(getErrorMessage(error, "Не удалось получить список файлов"));
    } finally {
      setLoading(false);
    }
  }, [inviteCode]);

  useEffect(() => {
    if (!active) return undefined;
    void loadFiles();
    return undefined;
  }, [active, loadFiles]);

  const uploadFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setStatus("Загрузка…");
    try {
      await apiClient.uploadMeetingFile(inviteCode, file);
      await loadFiles();
      setStatus("Файл загружен");
    } catch (error) {
      setStatus(getErrorMessage(error, "Не удалось загрузить файл"));
    }
  };

  const downloadFile = async (file) => {
    try {
      const response = await apiClient.downloadMeetingFile(inviteCode, file.id);
      const blob = new Blob([response.data]);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name || "file";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setStatus(getErrorMessage(error, "Не удалось скачать файл"));
    }
  };

  return (
    <section className={styles.panel} aria-label="Файлы встречи">
      <header className={styles.header}>
        <strong>Файлы встречи</strong>
        <button type="button" onClick={onClose} aria-label="Закрыть файлы">
          ×
        </button>
      </header>
      <label className={styles.upload}>
        Загрузить файл
        <input type="file" onChange={uploadFile} />
      </label>
      {status && <p className={styles.status}>{status}</p>}
      <ul className={styles.list}>
        {loading && files.length === 0 ? (
          <li>Загружаем список…</li>
        ) : files.length === 0 ? (
          <li>В папке встречи пока нет файлов</li>
        ) : (
          files.map((file) => (
            <li key={file.id}>
              <span>{file.name}</span>
              <button type="button" onClick={() => downloadFile(file)}>
                Скачать
              </button>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

export default MeetingFiles;
