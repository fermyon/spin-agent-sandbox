function isPalindrome(str) {
    // Convert to lowercase and remove non-alphanumeric characters
    const cleaned = str.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Compare the string with its reverse
    return cleaned === cleaned.split('').reverse().join('');
}

// Test cases
const testCases = [
    "racecar",
    "A man a plan a canal Panama",
    "race a car",
    "hello",
    "Madam",
    "Was it a car or a cat I saw?",
    "No 'x' in Nixon",
    "",
    "a",
    "12321",
    "12345"
];

console.log("Palindrome Checker Tests:");
console.log("========================");

testCases.forEach(test => {
    const result = isPalindrome(test);
    console.log(`"${test}" → ${result ? 'YES' : 'NO'}`);
});

// Alternative implementation using two pointers (more memory efficient)
function isPalindromeOptimized(str) {
    const cleaned = str.toLowerCase().replace(/[^a-z0-9]/g, '');
    let left = 0;
    let right = cleaned.length - 1;

    while (left < right) {
        if (cleaned[left] !== cleaned[right]) {
            return false;
        }
        left++;
        right--;
    }

    return true;
}

console.log("\nOptimized version test:");
