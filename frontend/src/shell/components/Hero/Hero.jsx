import styles from "./Hero.module.scss";

function Hero() {
    return (
        <section className={styles.hero}>

            <img
                className={styles.wave}
                src="/wave-lines.svg"
                alt=""
                aria-hidden="true"
            />

            <div className={`container ${styles.inner}`}>

                <h1 className={styles.title}>
                    TalkSphere — видеоконференции для работы и учебы
                </h1>

                <div className={styles.screenshot}>
                    <img
                        className={styles.screenshotImg}
                        src="/prewie.png"
                        alt="Скриншот сервиса TalkSphere"
                    />
                </div>

                <p className={styles.description}>
                    Проводите встречи, лекции и презентации с участниками со всего мира.
                    <br />
                    Без ограничений по времени. В HD-качестве и с полным контролем.
                </p>

            </div>

        </section>
    );
}

export default Hero;
