import styles from "./Features.module.scss";

const features = [
    {
        title: "Видео",
        text: "Четкая картинка и плавная передача даже при слабом интернете. Интеллектуальное шумоподавление убирает посторонние звуки.",
    },
    {
        title: "Чат",
        text: "Обмен сообщениями, ссылками и файлами прямо во время конференции. Реакции позволяют поддерживать спикера, не перебивая его голосом. Все чаты сохраняются в истории.",
    },
    {
        title: "Экран",
        text: "Показывайте рабочий стол, отдельные окна приложений или вкладки браузера. Подходит для презентаций, обучения и совместной работы над документами.",
    },
    {
        title: "Запись",
        text: "Одна кнопка — и встреча сохраняется в вашем облаке. Запись доступна для скачивания в любое время. Идеально для архивов и тех, кто не смог подключиться.",
    },
    {
        title: "Управление",
        text: "Полный контроль над комнатой. Выключайте микрофоны и камеры, удаляйте участников, назначайте со-ведущих. Режим \"Семинар\" для больших мероприятий.",
    },
    {
        title: "Планирование",
        text: "Создавайте встречи заранее. Система автоматически привязывает ссылку и отправляет напоминания всем участникам за 10 минут до начала.",
    },
];

function Features() {
    return (
        <section className={styles.features}>

            <img
                className={styles.wave}
                src="/wave-lines.svg"
                alt=""
                aria-hidden="true"
            />

            <div className={`container ${styles.content}`}>

                <h2 className={styles.heading}>
                    Что вы можете делать в TalkSphere
                </h2>

                <div className={styles.grid}>

                    {features.map((feature) => (
                        <div className={styles.card} key={feature.title}>

                            <div className={styles.cardHeader}>
                                <h3 className={styles.cardTitle}>
                                    {feature.title}
                                </h3>
                                <span className={styles.dot}></span>
                            </div>

                            <p className={styles.cardText}>
                                {feature.text}
                            </p>

                        </div>
                    ))}

                </div>

            </div>

        </section>
    );
}

export default Features;
