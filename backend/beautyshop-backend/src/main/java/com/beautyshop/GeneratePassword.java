
package com.beautyshop;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

public class GeneratePassword {

    public static void main(String[] args) {

        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

        String password = "123";
        String hash = encoder.encode(password);

        System.out.println("Mat khau: " + password);
        System.out.println("BCrypt hash: " + hash);

        System.out.println(
            "Kiem tra: " + encoder.matches(password, hash)
        );
    }
}
