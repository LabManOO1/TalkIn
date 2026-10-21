import styles from "./Footer.module.scss";

function Footer() {
    return (
        <footer className={styles.footer}>

            <div className={styles.content}>

                <p className={styles.copyright}>
                    ©TalkSphere
                </p>

            </div>

        </footer>
    );
}

export default Footer;
